import { operatingSnapshotVersion, evidenceUnit } from './aiOperatingFacts';
import type { EvidenceCard } from './aiTools';
import { renderDocx, SnapshotCard } from './aiDocumentRenderer';
import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import ExcelJS from 'exceljs';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * G3 步骤3：AI 报告文件服务（Excel 周报）
 * - 任务表 ai_report_files；requestId 幂等：同键返回原任务（不双建不双扣）
 * - 数字只来自服务端证据快照 (weekly_report_data 证据卡)，模型不参与任何数字
 * - xlsx 由固定代码生成器产出（类型化单元格：日期=日期，数值=数值）
 * - 文件落盘 backend/storage/ai-reports/<id>.xlsx；下载走服务端鉴权路由
 * - 重复下载不消费；排版失败重试复用分析快照，不再调用模型
 */

export interface ReportFileOwner {
  userId: string;
  organizationId: string;
  campusId: string | null;
}

/** 报告文件目录：可经 AI_REPORTS_DIR 指向本轮隔离目录（默认共享 backend/storage/ai-reports） */
export const REPORT_FILE_DIR = process.env.AI_REPORTS_DIR
  ? path.resolve(process.env.AI_REPORTS_DIR)
  : path.resolve(__dirname, '../../storage/ai-reports');

/** 公式注入防护：以 = + @ 开头（或以 - 开头且后随非数字）的文本单元格前置单引号 */
function safeCellText(v: unknown): string {
  const s = String(v ?? '');
  if (/^[\s]*[=+@]/.test(s) || /^[\s]*-\D/.test(s)) return "'" + s;
  return s;
}

// ==================== 期间解析（服务端确定，模型不参与数字） ====================

/** 从自然语言解析周/月期间（上海时区；周=周一至周日）。显式日期由意图参数优先。 */
export function parsePeriodFromText(text: string, today: string): { start: string; end: string } {
  // 日历运算以 YYYY-MM-DD 的 UTC 表示进行，避免上海午夜落到 UTC 前一天。
  const t = new Date(today + 'T00:00:00Z');
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (dates?.length) {
    if (dates.length > 2)
      throw new ApiError('请只指定一个起止日期范围', 400, 'REPORT_PERIOD_INVALID');
    for (const date of dates) {
      const parsed = new Date(date + 'T00:00:00Z');
      if (!Number.isFinite(parsed.getTime()) || fmt(parsed) !== date) {
        throw new ApiError(
          '报告日期无效，请使用真实的 YYYY-MM-DD 日期',
          400,
          'REPORT_PERIOD_INVALID'
        );
      }
    }
    const start = dates[0];
    const end = dates[1] || start;
    if (start > end) throw new ApiError('开始日期不能晚于结束日期', 400, 'REPORT_PERIOD_INVALID');
    return { start, end };
  }
  const dow = (t.getUTCDay() + 6) % 7; // 周一=0
  if (/本周/.test(text)) {
    const mon = new Date(t.getTime() - dow * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    return { start: fmt(mon), end: fmt(sun) };
  }
  if (/上周/.test(text.replace(/上上周/g, ''))) {
    const thisMon = new Date(t.getTime() - dow * 86400000);
    const lastMon = new Date(thisMon.getTime() - 7 * 86400000);
    const lastSun = new Date(lastMon.getTime() + 6 * 86400000);
    return { start: fmt(lastMon), end: fmt(lastSun) };
  }
  if (/上上周/.test(text)) {
    const mon = new Date(t.getTime() - (dow + 14) * 86400000);
    return { start: fmt(mon), end: fmt(new Date(mon.getTime() + 6 * 86400000)) };
  }
  if (/本月|这个月/.test(text)) {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
    return { start: fmt(first), end: fmt(last) };
  }
  if (/上月|上个月/.test(text)) {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
    return { start: fmt(first), end: fmt(last) };
  }
  // 默认本月
  const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
  return { start: fmt(first), end: fmt(last) };
}

// ==================== 任务创建（requestId 幂等） ====================

export interface CreateReportFileInput {
  requestId: string;
  conversationId: string | null;
  messageId: string | null;
  billId: string | null;
  title: string;
  periodStart: string;
  periodEnd: string;
  paramsJson: Record<string, unknown>;
  evidenceJson: Record<string, unknown>[];
}

/** 同 requestId 返回原任务（不双建）；新键建 processing 任务 */
export async function createOrGetReportFileTask(
  owner: ReportFileOwner,
  input: CreateReportFileInput
): Promise<{ id: string; duplicate: boolean; status: string }> {
  try {
    const row = await prisma.aiReportFile.create({
      data: {
        organizationId: owner.organizationId,
        campusId: owner.campusId,
        createdById: owner.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        requestId: input.requestId,
        billId: input.billId,
        title: input.title,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        paramsJson: input.paramsJson as any,
        evidenceJson: input.evidenceJson as any,
        status: 'processing',
      },
      select: { id: true, status: true },
    });
    return { id: row.id, duplicate: false, status: row.status };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const row = await prisma.aiReportFile.findUnique({ where: { requestId: input.requestId } });
      if (!row) throw new ApiError('报告任务查询失败', 500, 'REPORT_TASK_ERROR');
      // 归属校验：同 owner 才回放原任务
      if (
        row.organizationId !== owner.organizationId ||
        row.createdById !== owner.userId ||
        row.campusId !== owner.campusId
      ) {
        throw new ApiError('该请求键已被其他账号占用', 409, 'REPORT_KEY_CONFLICT');
      }
      return { id: row.id, duplicate: true, status: row.status };
    }
    throw err;
  }
}

// ==================== xlsx 生成器（固定代码；数字仅来自证据快照） ====================

type AnyCard = {
  tool?: string;
  title?: string;
  caliber?: string;
  timeRange?: { start: string; end: string } | null;
  missing?: string[];
  columns?: Array<{ key: string; label: string }>;
  rows?: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
};

/** 读回任务并生成 xlsx：成功→ready 落盘；失败→failed+error */
export async function generateReportFile(
  taskId: string
): Promise<{ status: string; error?: string }> {
  const task = await prisma.aiReportFile.findUnique({ where: { id: taskId } });
  if (!task) throw new ApiError('报告任务不存在', 404, 'NOT_FOUND');
  try {
    const cards = (task.evidenceJson || []) as unknown as SnapshotCard[];
    const selected = cards.filter(
      (c) => c.tool !== 'report_file' && !c.error && Array.isArray(c.rows)
    );
    const params = (task.paramsJson || {}) as Record<string, unknown>;
    const advice = typeof params.adviceText === 'string' ? params.adviceText : undefined;
    if ((!selected.length && !advice) || cards.some((c) => c.error))
      throw new Error('数据快照缺失或查询失败，请重新查询');
    const format = params.format === 'docx' ? 'docx' : 'xlsx';
    const snapshotVersion = operatingSnapshotVersion(selected as Partial<EvidenceCard>[]);
    let buffer: Buffer;
    if (format === 'docx')
      buffer = renderDocx(task.title, String(params.institutionName || '本机构'), selected, snapshotVersion, advice);
    else {
      const wb = new ExcelJS.Workbook();
      wb.creator = '蜂鸣课务 AI 工作台';
      wb.description = '经营数据快照 ' + snapshotVersion;
      wb.created = task.createdAt;
      const summary = wb.addWorksheet('分析汇总');
      summary.columns = [{ width: 30 }, { width: 28 }, { width: 28 }];
      summary.addRow([safeCellText(task.title)]);
      summary.mergeCells('A1:C1');
      summary.getRow(1).font = { bold: true, size: 14 };
      summary.getRow(1).height = 36;
      summary.addRow(['机构', safeCellText(params.institutionName || '本机构')]);
      summary.addRow(['业务范围', '指标', '结果']);
      summary.getRow(3).font = { bold: true };
      const usedNames = new Set(['分析汇总', '口径与来源', '管理建议']);
      if (advice) {
        const sheet = wb.addWorksheet('管理建议');
        sheet.columns = [{width:90}];
        for (const paragraph of advice.split(/\n+/).filter(Boolean)) {
          sheet.addRow([safeCellText(paragraph)]).alignment = {wrapText:true,vertical:'middle'};
        }
      }
      const typed = (v: unknown, key: string): ExcelJS.CellValue => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        if (
          typeof v === 'string' &&
          /出勤率|百分比|满班率|成单率/.test(key) &&
          /^-?\d+(?:\.\d+)?%$/.test(v)
        )
          return Number(v.slice(0, -1));
        if (
          typeof v === 'string' &&
          /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) &&
          /日期|时间|Date|Time|At|day/i.test(key)
        ) {
          const d = new Date(v);
          if (Number.isFinite(d.getTime())) return d;
        }
        const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (text.length > 32767) throw new Error('单元格超过Excel的32767字上限，请拆分字段后重试');
        return safeCellText(text);
      };
      for (const [index, card] of selected.entries()) {
        for (const [k, v] of Object.entries(card.totals || {})) {
          const row = summary.addRow([
            safeCellText(String(card.title || '业务数据').split('（')[0]),
            safeCellText(evidenceUnit(k) ? k+'（'+evidenceUnit(k)+'）' : k),
            typed(v, k),
          ]);
          row.getCell(3).numFmt = /金额|额$/.test(k)
            ? '#,##0.00'
            : Number.isInteger(v)
              ? '#,##0'
              : '#,##0.####';
          row.alignment = { vertical: 'top', wrapText: true };
          row.height = 30;
        }
        let name =
          String(card.title || '业务明细')
            .replace(/[\\/:*?\[\]]/g, '_')
            .slice(0, 27) || '明细';
        if (usedNames.has(name)) name = name.slice(0, 24) + '_' + (index + 1);
        usedNames.add(name);
        const ws = wb.addWorksheet(name);
        const columns = card.columns || [];
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        if (!columns.length) {
          ws.addRow(['当前范围无匹配数据']);
          continue;
        }
        ws.addRow(columns.map((c) => safeCellText(c.label)));
        ws.getRow(1).font = { bold: true };
        columns.forEach((c, i) => {
          ws.getColumn(i + 1).width = /原始内容|口径|说明/.test(c.label)
            ? 58
            : /id$|Id$/.test(c.key)
              ? 38
              : 22;
        });
        for (const row of card.rows || []) {
          const r = ws.addRow(columns.map((c) => typed(row[c.key], c.key)));
          columns.forEach((c, i) => {
            const cell = r.getCell(i + 1);
            if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd';
            else if (typeof cell.value === 'number') {
              if (/出勤率|百分比|满班率|成单率|目标完成率/.test(c.key)) {
                cell.value = Number(cell.value) / 100;
                cell.numFmt = '0.0%';
              } else
                cell.numFmt = /金额|amount|price|Amount/i.test(c.key)
                  ? '#,##0.00'
                  : Number.isInteger(cell.value)
                    ? '#,##0'
                    : '#,##0.####';
            }
          });
        }
        ws.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: Math.max(1, ws.rowCount), column: columns.length },
        };
        ws.eachRow((row) => {
          row.alignment = { vertical: 'top', wrapText: true };
          row.font = { ...row.font, name: 'Arial', size: 11 };
          row.height = Math.min(
            409,
            Math.max(
              30,
              ...columns.map(
                (c, i) =>
                  Math.ceil(
                    String(row.getCell(i + 1).value ?? '').replace(/[^\x00-\xff]/g, 'aa').length /
                      (Number(ws.getColumn(i + 1).width) || 22)
                  ) *
                    16 +
                  8
              )
            )
          );
        });
        ws.getRow(1).font = { bold: true, size: 11 };
        ws.pageSetup = {
          orientation: columns.length > 6 ? 'landscape' : 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: '1:1',
        };
      }
      const notes = wb.addWorksheet('口径与来源');
      notes.columns = [{ width: 28 }, { width: 100 }];
      notes.addRow(['来源', '说明']);
      notes.getRow(1).font = { bold: true };
      for (const card of selected) {
        notes.addRow([
          safeCellText(card.title),
          card.timeRange ? card.timeRange.start + ' 至 ' + card.timeRange.end : '当前快照/用户文件',
        ]);
        notes.addRow(['数据更新时间', card.generatedAt || '未记录']);
        notes.addRow(['口径', safeCellText(card.caliber)]);
        for (const n of card.missing || []) notes.addRow(['数据说明', safeCellText(n)]);
      }
      notes.eachRow((row) => {
        row.alignment = { vertical: 'top', wrapText: true };
        row.height = Math.min(
          409,
          Math.max(
            30,
            Math.ceil(
              String(row.getCell(2).value ?? '').replace(/[^\x00-\xff]/g, 'aa').length / 100
            ) *
              16 +
              8
          )
        );
      });
      buffer = Buffer.from(await wb.xlsx.writeBuffer());
    }
    fs.mkdirSync(REPORT_FILE_DIR, { recursive: true });
    const filePath = path.join(REPORT_FILE_DIR, `${task.id}.${format}`),
      temp = filePath + '.tmp';
    fs.writeFileSync(temp, buffer, { mode: 0o600 });
    fs.renameSync(temp, filePath);
    const fileName = task.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) + '.' + format;
    const hash = createHash('sha256').update(buffer).digest('hex');
    await prisma.aiReportFile.update({
      where: { id: task.id },
      data: { status: 'ready', error: null, fileName, filePath, fileHash: hash },
    });
    return { status: 'ready' };
  } catch (err: any) {
    await prisma.aiReportFile.update({
      where: { id: taskId },
      data: { status: 'failed', error: String(err?.message || '生成失败').slice(0, 300) },
    });
    return { status: 'failed', error: String(err?.message || '生成失败') };
  }
}

// ==================== 查询/重试/归属 ====================

export async function getReportFileForActor(actor: ReportFileOwner, id: string) {
  const row = await prisma.aiReportFile.findUnique({ where: { id } });
  if (!row) throw new ApiError('报告文件不存在', 404, 'NOT_FOUND');
  if (
    !actor.userId ||
    !actor.organizationId ||
    row.organizationId !== actor.organizationId ||
    row.createdById !== actor.userId
  ) {
    throw new ApiError('无权访问该报告文件', 403, 'FORBIDDEN');
  }
  if (row.campusId !== actor.campusId) {
    throw new ApiError('无权访问该报告文件（跨校区）', 403, 'CAMPUS_FORBIDDEN');
  }
  return row;
}

/** 失败/文件丢失重试：复用分析快照重新排版，不调用模型、不新增账单 */
export async function retryReportFile(actor: ReportFileOwner, id: string) {
  const row = await getReportFileForActor(actor, id);
  const diskExists = row.filePath ? fs.existsSync(row.filePath) : false;
  const retryable = row.status === 'failed' || (row.status === 'ready' && !diskExists);
  if (!retryable) {
    throw new ApiError('仅失败或文件丢失的任务可重试', 409, 'NOT_RETRYABLE');
  }
  const claimed = await prisma.aiReportFile.updateMany({
    where: { id: row.id, status: row.status },
    data: { status: 'processing', error: null },
  });
  if (!claimed.count)
    throw new ApiError('文件正在由另一请求重新生成，请刷新状态', 409, 'REPORT_PROCESSING');
  const r = await generateReportFile(row.id);
  return r;
}

/** 文件卡（SSE/消息/前端共用的形状） */
export function buildFileCard(row: {
  id: string;
  status: string;
  error?: string | null;
  title: string;
  fileName?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  return {
    type: 'file',
    tool: 'report_file',
    title: row.title,
    status: row.status,
    fileId: row.id,
    fileName: row.fileName || null,
    periodStart: row.periodStart || null,
    periodEnd: row.periodEnd || null,
    downloadUrl: row.status === 'ready' ? `/api/ai/report-files/${row.id}/download` : null,
    error: row.error || null,
  };
}

/** Read and verify the exact bytes of this immutable task before sending any response. */
export function verifiedReportFileBuffer(row: {id:string;filePath:string|null;fileHash:string|null}): Buffer {
  const resolved = row.filePath && path.resolve(row.filePath);
  if (!resolved || path.dirname(resolved) !== REPORT_FILE_DIR ||
      ![row.id+'.xlsx',row.id+'.docx'].includes(path.basename(resolved)))
    throw new ApiError('报告文件路径不符，请重新生成',409,'REPORT_FILE_INTEGRITY');
  const buffer = fs.readFileSync(resolved);
  if (!row.fileHash || createHash('sha256').update(buffer).digest('hex') !== row.fileHash)
    throw new ApiError('报告文件校验失败，请重新生成',409,'REPORT_FILE_INTEGRITY');
  return buffer;
}
