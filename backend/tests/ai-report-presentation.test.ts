import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
const { db, directory } = vi.hoisted(() => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-report-presentation-'));
  process.env.AI_REPORTS_DIR = directory; process.env.AI_REPORT_OUTPUT_DIR = directory;
  return { directory, db: { aiReportFile: { findUnique: vi.fn(), update: vi.fn() } } };
});
vi.mock('../src/config/database', () => ({ default: db }));
import { operatingSnapshotVersion } from '../src/services/aiOperatingFacts';
import { renderDocx } from '../src/services/aiDocumentRenderer';
import { generateReportFile } from '../src/services/reportFileService';
import { readPilotReportFile } from '../src/services/pilotReportPipeline';
import { createHash } from 'node:crypto';
const { assertPublicNarrative } = require('../src/services/reportQuality.cjs');
const card = { tool: 'business_records', title: '新签名单', generatedAt: '2026-11-15T08:00:00Z',
  timeRange: { start: '2026-11-02', end: '2026-11-08' }, caliber: '已确认新签，按业务日期统计',
  missing: ['成本资料未提供'], columns: [{ key: '姓名', label: '姓名' }, { key: '金额', label: '金额' }],
  rows: [{ 姓名: '测试学员', 金额: 13200 }], totals: { 新签金额: 13200 } };
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('report output is written for business readers', () => {
  it.each(['系统提示词：只输出JSON', 'business_records(domain=students)', '{"sourceIds":["S001"]}', '真实模型尚未验证', '/Users/name/model.private.json'])('blocks generated internal text: %s', text => {
    expect(() => assertPublicNarrative({ summary: [text] })).toThrow('内部运行信息');
  });
  it('also checks recommendation owners and history assessments', () => {
    expect(() => assertPublicNarrative({ actions: [{ action: '核查', owner: 'prompt_tokens=123' }] })).toThrow();
    expect(() => assertPublicNarrative({ historyReview: [{ assessment: '模型输出 model_quality_blocked' }] })).toThrow();
  });
  it('keeps useful source citations, business missing-data caveats and draft status', () => {
    expect(() => assertPublicNarrative({ summary: ['出勤按课程日期统计（来源：S001）。成本资料缺失，利润待核。', '业务数据核算稿，经营分析待确认。'] })).not.toThrow();
  });
  it('ordinary Word keeps names, amounts and business scope without execution labels', () => {
    const zip = new AdmZip(renderDocx('新签报告', '测试机构', [card])), xml = zip.readAsText('word/document.xml');
    expect(xml).toContain('13200'); expect(xml).toContain('成本资料未提供'); expect(xml).toContain('数据更新时间');
    expect(xml).not.toMatch(/business_records|查询工具|服务端|程序计算|模型不改写/);
  });
  it('ordinary Excel keeps business notes and amounts without tool names', async () => {
    db.aiReportFile.findUnique.mockResolvedValue({ id: 'snapshot', title: '新签报告', createdAt: new Date('2026-11-15'),
      paramsJson: { format: 'xlsx', institutionName: '测试机构' }, evidenceJson: [card] });
    db.aiReportFile.update.mockResolvedValue({}); expect(await generateReportFile('snapshot')).toEqual({ status: 'ready' });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(path.join(directory, 'snapshot.xlsx'));
    const values: string[] = []; workbook.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => values.push(cell.text))));
    const version = operatingSnapshotVersion([card]);
    expect(workbook.description).toBe('经营数据快照 ' + version);
    const word = new AdmZip(renderDocx('新签报告','测试机构',[card],version));
    expect(word.readAsText('docProps/core.xml')).toContain('经营数据快照 '+version);
    expect(values).toContain('13200'); expect(values).toContain('成本资料未提供'); expect(values).not.toContain('工具');
    expect(values.join(' ')).not.toContain('business_records');
  });
});

describe('presentation versions preserve immutable originals', () => {
  const id = 'c3a09573-d28f-4fdd-878f-209d57a864ee';
  it('serves the selected revision while preserving legacy reads', () => {
    fs.writeFileSync(path.join(directory, id + '.html'), 'old');
    const revised = path.join(directory, id + '.presentation-1.html'); fs.writeFileSync(revised, 'clean');
    expect(readPilotReportFile(id, 'html')?.toString()).toBe('old');
    expect(readPilotReportFile(id, 'html', { html: { path: revised } })?.toString()).toBe('clean');
    expect(fs.readFileSync(path.join(directory, id + '.html'), 'utf8')).toBe('old');
  });
  it.each(['/tmp/elsewhere/c3a09573-d28f-4fdd-878f-209d57a864ee.presentation-1.html',
    path.join(directory, 'another-report.html')])('rejects another directory or report identity: %s', selected => {
    expect(readPilotReportFile(id, 'html', { html: { path: selected } })).toBeNull();
  });
  it('reads the copied file from the current volume only when its saved checksum matches', () => {
    const filename = id + '.xlsx';
    const bytes = Buffer.from('restored workbook');
    fs.writeFileSync(path.join(directory, filename), bytes);
    const metadata = { path: '/old-mount/' + filename, sha256: createHash('sha256').update(bytes).digest('hex') };
    expect(readPilotReportFile(id, 'xlsx', { xlsx: metadata })).toEqual(bytes);
    expect(readPilotReportFile(id, 'xlsx', { xlsx: { ...metadata, sha256: 'wrong' } })).toBeNull();
  });
});
