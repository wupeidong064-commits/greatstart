import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/config/database', () => ({ default: {} }));
import { resolveBusinessCalendar } from '../src/services/aiBusinessCalendar';
import { parseIntent } from '../src/services/aiIntent';
import { inheritPreviousIntent } from '../src/services/aiWorkbenchPolicy';

const today = '2026-11-16';
const range = (start: string, end: string) => ({ start, end });
const period = (question: string, day = today) => resolveBusinessCalendar({ question, today: day });
describe('Shanghai business calendar', () => {
  it('accepts an explicit date restated as today while preserving conflicting dates', () => {
    const result = period('2026年11月16日，本校区今天新签了多少元？');
    expect(result.clarification).toBeUndefined();
    expect(result.observation).toEqual(range(today, today));
    expect(result.singleDayMention).toBe(true);
    expect(period('2026年11月15日，本校区今天新签了多少元？').clarification).toBeTruthy();
  });
  it.each([
    ['近30天的出勤', today, '2026-10-18', '2026-11-16'],
    ['十月十六日至十一月十六日', today, '2026-10-16', '2026-11-16'],
    ['2024-02-29', today, '2024-02-29', '2024-02-29'],
    ['查2023年12月31日到2月29日', today, '2023-12-31', '2024-02-29'],
    ['2025-12-30 至 2026-01-02', today, '2025-12-30', '2026-01-02'],
    ['11月1号到16号', today, '2026-11-01', '2026-11-16'],
    ['上周', '2026-01-01', '2025-12-22', '2025-12-28'],
    ['上个月', '2024-03-31', '2024-02-01', '2024-02-29'],
    ['截至2024年3月1日近三十天', today, '2024-02-01', '2024-03-01'],
  ])('%s anchored to %s', (q, day, start, end) => {
    expect(period(q, day)).toMatchObject({ observation: range(start, end), explicit: true });
    expect(period(q, day).clarification).toBeUndefined();
  });
  it.each([
    '2026年2月29日',
    '2024-02-30',
    '13月',
    '11月31日',
    '2025-05-19至2025-05-01',
    '10月1日、11月1日',
    '11/12',
    '近期',
    '5号',
    '上上个月底',
    '2024-01-01至2024-02-01至2024-03-01',
    '近0天',
  ])('asks on %s', (q) => expect(period(q).clarification).toBeTruthy());
  it('keeps target and baseline independent', () => {
    expect(period('针对老师的表现制定下个月的目标', '2026-01-20')).toMatchObject({
      observation: range('2025-12-01', '2025-12-31'),
      target: range('2026-02-01', '2026-02-28'),
    });
    expect(period('用近30天的表现制定下个月的目标')).toMatchObject({
      observation: range('2026-10-18', today),
      target: range('2026-12-01', '2026-12-31'),
    });
    const previous = { observation: range('2026-04-01', '2026-04-30') };
    expect(
      resolveBusinessCalendar({ question: '沿用刚才的基线制定下月目标', today, previous })
        .observation
    ).toEqual(previous.observation);
  });
  it('keeps explicit cohort and attendance observation deadline separate', () => {
    const x = resolveBusinessCalendar({
      question: '10月的新生截至11月5日有没有上课？',
      today,
      intent: { tools: [{ name: 'new_student_attendance', params: {} }] },
    });
    expect(x).toMatchObject({
      asOfDate: '2026-11-05',
      observation: range('2026-10-01', '2026-10-31'),
    });
  });
  it.each([
    ['10月和8月相比', '2026-10-01', '2026-10-31', '2026-08-01', '2026-08-31'],
    ['与9月相比，10月呢', '2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30'],
    ['2024年3月环比', '2024-03-01', '2024-03-31', '2024-02-01', '2024-02-29'],
    ['2025年2月同比', '2025-02-01', '2025-02-28', '2024-02-01', '2024-02-29'],
  ])('distinct periods in %s', (q, bs, be, ps, pe) =>
    expect(period(q)).toMatchObject({ observation: range(bs, be), comparison: range(ps, pe) })
  );
  it('ignores fabricated dates and an inconsistent goal slot', () => {
    const x = resolveBusinessCalendar({
      question: '上个月有多少成单',
      today,
      intent: { timeIntent: { target: '上个月', observation: '2019-03' } },
    });
    expect(x.target).toBeUndefined();
    expect(x.observation).toEqual(range('2026-10-01', '2026-10-31'));
  });
});
describe('bounded intent and followup', () => {
  const cards = ['signup_renewal', 'class_attendance'].map((tool) => ({
    tool,
    rows: [],
    filters: { campusId: 'C' },
    timeRange: range('2026-09-01', '2026-09-30'),
  }));
  it('requeries every previous metric for an elliptical period change', () => {
    const x = inheritPreviousIntent('换成最近三十天呢？', {}, cards, today);
    expect(x.reuseSnapshot).toBe(false);
    expect(x.tools).toEqual(
      cards.map((c) => ({ name: c.tool, params: { startDate: '2026-10-18', endDate: today } }))
    );
  });
  it.each([
    '导出王老师的表格',
    '换成一班的名单',
    '导出其他校区成单',
    '只看李老师',
    '导出本月出勤和续费',
  ])('fresh plan required for %s', (q) =>
    expect(inheritPreviousIntent(q, {}, cards, today).reuseSnapshot).toBeFalsy()
  );
  it('avoids changing the date label on a current-state tool', () =>
    expect(
      inheritPreviousIntent(
        '上月呢',
        {},
        [{ tool: 'business_records', rows: [], filters: { domain: 'students' } }],
        today
      ).reply
    ).toMatch(/当前状态/));
  it('rejects malformed typed plans; retains the legacy tools shape', () => {
    expect(
      parseIntent(
        '{"subject":"teacher","purpose":"mixed","metrics":["attendance"],"groupBy":["teacher"],"timeIntent":{"target":"下月"},"tools":[]}'
      )
    ).toMatchObject({
      parsedOk: true,
      subject: 'teacher',
      purpose: 'mixed',
      timeIntent: { target: '下月' },
    });
    for (const raw of [
      '{}',
      '{"tools":[],"purpose":"write"}',
      '{"tools":[],"subject":"random"}',
      '{"tools":[],"metrics":1}',
      '{"tools":[],"timeIntent":{"target":{"sql":"select"}}}',
    ])
      expect(parseIntent(raw).parsedOk).toBeFalsy();
    expect(parseIntent('{"tools":[]}')).toMatchObject({ parsedOk: true, tools: [] });
  });
});

describe('calendar shared by operating reports and business metrics', () => {
  it.each([
    ['生成2026年10月月报', 'monthly', '2026-10-01', '2026-10-31'],
    ['生成2024年2月27日的周报', 'weekly', '2024-02-27', '2024-03-04'],
    ['生成2026-11-02至2026-11-08运营周报', 'weekly', '2026-11-02', '2026-11-08'],
    ['生成昨天的日报', 'daily', '2026-11-15', '2026-11-15'],
  ])('%s', async (q, kind, start, end) => {
    const { reportRequest } = await import('../src/services/operatingReportService');
    expect(reportRequest(q, today)).toMatchObject({ kind, start, end });
  });
  it('does not substitute a previous period or report for an invalid date or a different entity', async () => {
    const { reportRequest } = await import('../src/services/operatingReportService');
    const old = { kind: 'weekly', start: '2024-02-26', end: '2024-03-03' };
    expect(reportRequest('生成2025年2月29日周报', today, old)).toMatchObject({ needsPeriod: true });
    expect(reportRequest('生成本月的周报', today)).toMatchObject({ needsPeriod: true });
    expect(reportRequest('生成2026-11-02至2026-11-02周报', today)).toMatchObject({
      needsPeriod: true,
    });
    expect(reportRequest('导出李老师的成单', today, old)).toBeNull();
    expect(reportRequest('导出Word', today, old)).toMatchObject(old);
    expect(reportRequest('换成上周呢', today, old)).toMatchObject({
      start: '2026-11-09',
      end: '2026-11-15',
    });
  });
  it('compares elapsed month to equal elapsed month; leaves literal endpoints alone', () => {
    expect(period('本月环比')).toMatchObject({
      observation: range('2026-11-01', today),
      comparison: range('2026-10-01', '2026-10-16'),
    });
    expect(period('11月1日至11月30日环比')).toMatchObject({
      observation: range('2026-11-01', '2026-11-30'),
      comparison: range('2026-10-01', '2026-10-31'),
    });
  });
  it('bounds the action selection', () => {
    expect(parseIntent('{"tools":[],"actionIds":["abc","abc"]}').actionIds).toEqual(['abc']);
    expect(parseIntent('{"tools":[],"actionIds":["a","b","c","d","e"]}').parsedOk).toBeFalsy();
  });
});

describe('explicit interval precedence', () => {
  it.each(['近30天（10月16日到11月16日）的成单', '10月16日到11月16日，近30天的出勤'])(
    'respects actual boundaries in %s',
    (q) => {
      const result = period(q);
      expect(result.clarification).toBeUndefined();
      expect(result.observation).toEqual(range('2026-10-16', '2026-11-16'));
    }
  );
  it('supports to-date and does not turn a historic target attainment question into a plan', () => {
    expect(period('本月至今的续费')).toMatchObject({ observation: range('2026-11-01', today) });
    expect(period('上月目标达成情况')).toMatchObject({
      observation: range('2026-10-01', '2026-10-31'),
    });
    expect(period('上月目标达成情况').target).toBeUndefined();
  });
});
