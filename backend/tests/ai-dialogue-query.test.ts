import { describe, expect, it } from 'vitest';
import { bindDialogue, dialogueHistory, renderDialogue } from '../src/services/aiDialogueQuery';
import { mentionedPeriods } from '../src/services/aiBusinessCalendar';
import type { DialogueQuery } from '../src/services/aiDialogueQuery';
import type { Evidence } from '../src/services/aiTools';

const ctx = { today: '2026-11-23', organizationId: 'fixture', campusId: 'campus' };
const may = { start: '2026-05-01', end: '2026-05-18' },
  lastMay = { start: '2025-05-01', end: '2025-05-18' };
const orders: DialogueQuery = { source: 'orders', op: 'read', periods: [may] };
function card(totals: Evidence['totals'], rows: Evidence['rows'] = []): Evidence {
  return {
    tool: 'signup_renewal',
    generatedAt: '',
    businessAsOf: ctx.today,
    evidenceId: 'test',
    title: '',
    unit: '',
    caliber: '',
    timeRange: may,
    filters: {},
    missing: [],
    columns: [],
    rows,
    totals,
    error: null,
    modelText: '',
  };
}
function bind(x: object, q: string, history: DialogueQuery[] = []) {
  return bindDialogue(JSON.stringify(x), q, history, ctx, '测试机构');
}
describe('validated analytical dimensions', () => {
  it('reads a shared month and leaves following prose intact', () => {
    expect(mentionedPeriods('5月1日至5日和7日至9日一共几次', ctx.today)).toEqual([
      { start: '2026-05-01', end: '2026-05-05' },
      { start: '2026-05-07', end: '2026-05-09' },
    ]);
  });
  it('rejects invalid calendar dates', () => {
    expect(() => mentionedPeriods('2026年2月30日至3月4日', ctx.today)).toThrow();
  });
  it('uses explicit business dates over a model generated date range', async () => {
    const result = await bind(
      { source: 'orders', op: 'read', periods: [lastMay], time: lastMay },
      '2026年5月1日到18日的成交'
    );
    expect(result).toMatchObject({ query: orders });
  });
  it('orders comparable periods by the requested base and never divides by zero', async () => {
    const r = await bind(
      { source: 'orders', op: 'growth', time: 'yearComparison', inherit: true },
      '比去年同期增幅如何？',
      [orders]
    );
    if (!r || !('query' in r)) throw Error('missing query');
    expect(r.query.periods).toEqual([lastMay, may]);
    const answer = renderDialogue(r.query, [
      card({ 新单数: 0, 续费单数: 0, 金额合计: 0 }),
      card({ 新单数: 2, 续费单数: 1, 金额合计: 350 }),
    ]);
    expect(answer).toContain('增加 350 元');
    expect(answer).toContain('基期为零');
  });
  it('distinguishes an absent aggregate from a verified empty set', () => {
    expect(renderDialogue(orders, [card({})])).toMatch(/无法确认/);
    expect(renderDialogue(orders, [card({ 新单数: 0, 续费单数: 0, 金额合计: 0 })])).toContain(
      '0 笔'
    );
  });
  it('refuses to double count intersecting periods', () => {
    const q: DialogueQuery = {
      ...orders,
      op: 'sum',
      periods: [may, { start: may.start, end: may.start }],
    };
    expect(renderDialogue(q, [card({}), card({})])).toContain('重叠');
  });
  it('recovers a previous release query without carrying private output rows into the frame', () => {
    const ev = {
      ...card({}),
      tool: 'teacher_performance_ranking',
      filters: { metric: 'sales', scope: 'teachers', direction: 'min' },
    };
    expect(
      dialogueHistory([
        { role: 'assistant', status: 'complete', evidenceJson: [ev], usageJson: {} },
      ])
    ).toEqual([
      expect.objectContaining({
        source: 'teachers',
        periods: [may],
        metric: 'sales',
        op: 'minimum',
        allStaff: false,
      }),
    ]);
  });
  it('holds named balance queries to the business day', async () => {
    expect(
      await bind({ source: 'balance', names: ['测试生'] }, '测试生2027年5月1日还有课吗')
    ).toMatchObject({ reply: expect.stringContaining('未来') });
  });
  it('preserves an explicit zero cap', async () => {
    const r = await bind(
      { source: 'renewals', op: 'list', maxRemaining: 0 },
      '余额最多0节的待续费名单'
    );
    expect(r).toMatchObject({
      tools: [{ name: 'renewal_candidates', params: { maxRemaining: 0 } }],
    });
  });
  it('keeps cash and confirmed sales separately grounded even when their amounts happen to agree', async () => {
    const r = await bind({ source: 'orders' }, '2026年5月1日到18日，实收和成单分别是多少？');
    if (!r || !('query' in r)) throw Error('missing query');
    expect(r.tools[0].name).toBe('weekly_report_data');
    expect(renderDialogue(r.query, [card({ 实收: 90, 总成单额: 120 })])).toMatch(
      /成交 120 元，实收 90 元/
    );
  });
  it('treats a single cross-year range as one sum', async () => {
    const r = await bind(
      { source: 'orders', op: 'sum', time: 'recentPair' },
      '2025年12月29日至2026年1月4日合计多少？'
    );
    expect(r).toMatchObject({ query: { periods: [{ start: '2025-12-29', end: '2026-01-04' }] } });
  });
  it('keeps campus scope checks ahead of queries', async () => {
    expect(await bind({ source: 'orders', campus: '其他机构' }, '查其他机构的成交')).toMatchObject({
      reply: expect.stringContaining('权限'),
    });
  });
});
