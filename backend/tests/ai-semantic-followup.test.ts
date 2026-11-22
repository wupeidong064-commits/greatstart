import { describe, expect, it } from 'vitest';
import { criticalMetricClarification, entitySwapFollowupIntent, explanationIntent, generalAttendanceAdvice, inheritPreviousIntent, localBusinessIntent, studentBalanceIntent } from '../src/services/aiWorkbenchPolicy';
import { bindSumWindows, rankFollowupBinding } from '../src/services/aiQueryBinding';
import { resolveBusinessCalendar } from '../src/services/aiBusinessCalendar';
import { calendarTools } from '../src/services/aiOperatingPlan';
import { renderTeacherComparison, teacherComparisonIntent, teacherDeclines } from '../src/services/aiTeacherComparison';
import { rankTeachingRows, teacherRankingIntent } from '../src/services/aiTeacherRanking';
import { parseIntent } from '../src/services/aiIntent';
import type { Evidence } from '../src/services/aiTools';

const today = '2026-11-20';
const question = '哪些老师的工作表现有下滑呢？';
const notice = '确认收入缺少可靠计价依据，暂不核算；成本未采集，不计算利润';

describe('understand the request before querying', () => {
  it('answers the exact teacher ranking question over the most recent six calendar months', () => {
    const question = '最近半年 你觉得哪个老师的数据表现最好';
    const intent = teacherRankingIntent(question)!;
    const calendar = resolveBusinessCalendar({ question, today:'2026-11-21', intent });
    expect(calendar.observation).toEqual({ start:'2026-05-22', end:'2026-11-21' });
    expect(calendarTools(intent, calendar)).toEqual([{
      name:'teacher_performance_ranking', params:{ metric:'attendance', scope:'teachers', startDate:'2026-05-22', endDate:'2026-11-21' },
    }]);
    expect(resolveBusinessCalendar({question:'过去六个月',today:'2026-11-21'}).observation).toEqual(calendar.observation);
    expect(resolveBusinessCalendar({question:'最近半年',today:'2026-08-31'}).observation).toEqual({start:'2026-03-01',end:'2026-08-31'});
    // N1：点名“老师”默认按教学人员统计，含销售岗必须用户明确放开。
    expect(teacherRankingIntent('最近半年哪位老师成单额最高')?.tools?.[0].params).toEqual({metric:'sales', scope:'teachers'});
    expect(teacherRankingIntent('最近半年哪位老师成单额最高，把顾问也算上')?.tools?.[0].params).toEqual({metric:'sales'});
    expect(teacherRankingIntent('最近半年谁的个人成单额最高')?.tools?.[0].params).toEqual({metric:'sales'});
  });

  it('ranks using the selected metric and leaves unknown evidence out', () => {
    const sample = (teacherId:string, teacherName:string, actualAttendance:number, expectedAttendance:number, totalOrderAmount:number) =>
      ({teacherId, teacherName, actualAttendance, expectedAttendance, totalOrderAmount, actualConsumptionAmount: null,
        missingPriceCount: 0, personalNewRecruits: 0, unlinkedNewOrderCount: 0});
    const rows = [sample('a','周老师',356,391,8060), sample('b','程老师',273,302,10400), sample('n','无样本',0,0,0)];
    expect(rankTeachingRows(rows,'attendance').map(r=>r.老师)).toEqual(['周老师','程老师']);
    expect(rankTeachingRows(rows,'sales')[0].老师).toBe('程老师');
    expect(rankTeachingRows(rows,'consumption')).toEqual([]);
  });
  it('explains the report sentence including the quoted profit keyword', () => {
    expect(criticalMetricClarification(notice + ' 这是什么意思？')).toBeUndefined();
    const direct = explanationIntent(notice + ' 这是什么意思？');
    expect(direct?.reply).toContain('实际课消金额');
    expect(direct?.tools).toBeUndefined();
    expect(explanationIntent('上面这句话是啥意思？', notice)).toEqual(direct);
    expect(criticalMetricClarification('本月我们赚了多少钱？')?.reply).toContain('净成单额');
    expect(parseIntent('{"purpose":"explanation","reply":"这里的意思是按购课价计算。"}').purpose).toBe('explanation');
  });
  it('answers generic advice without retrieving campus data', () => {
    expect(generalAttendanceAdvice('老师带的班出勤下滑，一般怎么排查？')?.reply).toContain('课次');
    expect(generalAttendanceAdvice('我们上周出勤下滑，请用数据分析')).toBeUndefined();
    expect(teacherComparisonIntent('出勤下滑时，老师一般怎么排查？', [])).toBeUndefined();
  });
  it('defaults to full weeks and carries named scope across a changed date', () => {
    const intent = teacherComparisonIntent(question, [])!;
    const calendar = resolveBusinessCalendar({ question, today, intent });
    const [tool] = calendarTools(intent, calendar);
    expect(tool).toMatchObject({
      name: 'teacher_performance_comparison',
      params: { startDate: '2026-11-09', endDate: '2026-11-15', comparisonStartDate: '2026-11-02', comparisonEndDate: '2026-11-08' },
    });
    const card = { tool: tool.name, rows: [{ 姓名: '方老师' }], filters: { teacherName: '方老师', metric: 'attendance' },
      timeRange: calendar.observation, error: null } as unknown as Evidence;
    const follow = teacherComparisonIntent('那为什么方老师下滑？', [card])!;
    expect(follow.tools?.[0].params).toEqual({ breakdown: 'true', teacherName: '方老师', metric: 'attendance' });
    expect(resolveBusinessCalendar({ question: '那为什么方老师下滑？', today, intent: follow, previous: calendar }).comparison).toEqual(calendar.comparison);
    expect(inheritPreviousIntent('改成上个月', {}, [card], today).tools?.[0]).toMatchObject({
      name: tool.name, params: { teacherName: '方老师', metric: 'attendance' },
    });
  });
  it('names the declining teachers and leaves missing price out of the comparison', () => {
    const row = (teacherId: string, teacherName: string, attendanceRate: number, actualConsumptionAmount: number | null) =>
      ({ teacherId, teacherName, attendanceRate, actualConsumptionAmount, expectedAttendance: 30, actualAttendance: Math.round(attendanceRate * 0.3) });
    const before = [row('a', '方老师', 97, 3368), row('b', '乔老师', 91, 2898), row('c', '唐老师', 70, 2048)];
    const after = [row('b', '乔老师', 87, null), row('a', '方老师', 87, 3014), row('c', '唐老师', 87, 2560)];
    const rows = teacherDeclines(after, before);
    expect(rows.map(r => [r.老师, r.出勤率变化, r.课消变化])).toEqual([['乔老师', -4, null], ['方老师', -10, -354]]);
    expect(teacherDeclines(after, before, 'consumption').map(r => r.老师)).toEqual(['方老师']);
    const card = { filters: { previousStart: '2026-11-02', previousEnd: '2026-11-08' },
      timeRange: { start: '2026-11-09', end: '2026-11-15' }, rows,
      totals: { 可比老师数: 3, 指标下降老师数: 2 }, missing: [] } as unknown as Evidence;
    expect(renderTeacherComparison(card)).toMatch(/^\*\*乔老师、方老师\*\*/);
    expect(renderTeacherComparison(card)).not.toContain('唐老师');
  });
  it('carries ranking metric, scope, period and only flips direction on omitted-metric follow-ups (R1/N1)', () => {
    const prev = [{ tool: 'teacher_performance_ranking', rows: [{ 老师: '周老师', 个人成单额: 16935 }], filters: { metric: 'sales', scope: 'teachers', direction: 'max' },
      timeRange: { start: '2026-10-01', end: '2026-10-31' }, error: null } as unknown as Evidence];
    // 省略指标的方向追问：沿用个人成单额、教学岗范围和 10 月期间，只把方向切为最低。
    const follow = rankFollowupBinding('哪位老师表现最差？', prev, '2026-11-22')!;
    expect(follow.tools?.[0]).toMatchObject({
      name: 'teacher_performance_ranking',
      params: { metric: 'sales', scope: 'teachers', direction: 'min', startDate: '2026-10-01', endDate: '2026-10-31' },
    });
    // 明确改指标：只换指标与方向，期间继续承接。
    const switched = rankFollowupBinding('那改按出勤率，谁排最后', prev, '2026-11-22')!;
    expect(switched.tools?.[0].params).toMatchObject({ metric: 'attendance', direction: 'min', scope: 'teachers', startDate: '2026-10-01' });
    // 范围扩缩：明确放开才并入销售岗；再缩回教学岗也成立。
    const expand = rankFollowupBinding('把顾问也算上，谁第一', prev, '2026-11-22')!;
    expect(expand.tools?.[0].params).toMatchObject({ metric: 'sales', direction: 'max', startDate: '2026-10-01' });
    expect(expand.tools?.[0].params.scope).toBeUndefined();
    const narrow = rankFollowupBinding('只在授课老师里比，谁第一', prev, '2026-11-22')!;
    expect(narrow.tools?.[0].params.scope).toBe('teachers');
    // 两人比较不走承接（比较意图专属）。
    expect(rankFollowupBinding('周老师和程老师谁更差', prev, '2026-11-22')).toBeUndefined();
    // 新话题（学员）不承接老师排名。
    expect(rankFollowupBinding('哪个学员出勤率最低', prev, '2026-11-22')).toBeUndefined();
    // 无上一轮排名卡时不接管。
    expect(rankFollowupBinding('哪位老师表现最差？', [], '2026-11-22')).toBeUndefined();
  });
  it('binds dated student balance to the specified person and date, else reuses the previous balance card (N3)', () => {
    const prev = [{ tool: 'search_students', rows: [{ name: '林沐辰', remainingLessons: 1 }], filters: { keyword: '林沐辰' }, error: null } as unknown as Evidence];
    const dated = studentBalanceIntent('2026年10月31日，林沐辰还剩几节课？')!;
    expect(dated.tools?.[0]).toMatchObject({ name: 'search_students', params: { keyword: '林沐辰', balanceAsOfDate: '2026-10-31' } });
    const now = studentBalanceIntent('林沐辰现在还剩几节课？')!;
    expect(now.tools?.[0].params).toEqual({ keyword: '林沐辰' });
    const follow = studentBalanceIntent('那现在还剩几节？', prev)!;
    expect(follow.tools?.[0].params).toEqual({ keyword: '林沐辰' });
    expect(studentBalanceIntent('那现在还剩几节？', [])).toBeUndefined();
    // 月份区间余额不绑定时点；由 bindPlan 拒绝区间统计（时点数值语义）。
    expect(studentBalanceIntent('2026年10月，林沐辰还剩几节课？')?.tools?.[0].params).toEqual({ keyword: '林沐辰' });
  });
  it('keeps ranking direction on period-only follow-up, re-paths on object switch, refuses future dates (接续复验轮)', () => {
    const card = { tool: 'teacher_performance_ranking', rows: [{ 老师: '周老师', 个人成单额: 16935 }],
      filters: { metric: 'sales', scope: 'teachers', direction: 'min' },
      timeRange: { start: '2026-10-01', end: '2026-10-31' }, error: null } as unknown as Evidence;
    // 只改月份沿用最低方向与岗位范围（11 月教学岗最低=唐老师）。
    const periodOnly = inheritPreviousIntent('改成 11 月呢', {}, [card], '2026-11-22')!;
    expect(periodOnly.tools?.[0].params).toMatchObject({ metric: 'sales', scope: 'teachers', direction: 'min', startDate: '2026-11-01', endDate: '2026-11-30' });
    // 换查询对象（课程）不承接老师排名；范围放开承接不受影响。
    expect(rankFollowupBinding('哪门课程成单额最高', [card], '2026-11-22')).toBeUndefined();
    expect(rankFollowupBinding('把顾问也算上，谁第一', [card], '2026-11-22')).toBeDefined();
    // 未来日期余额如实拒答，不把当前值标在未来日期下。
    const fut = studentBalanceIntent('2026年12月31日，林沐辰还剩几节课？')!;
    expect(fut.reply).toContain('无法核实');
    expect(fut.tools).toBeUndefined();
    // mock 同款问法也如实说明无课程排名口径。
    expect(localBusinessIntent('哪门课程成单额最高', '2026-11-22').reply).toContain('课程');
    // 带明确日期的问题不落实体承接（上一轮卡里有同名实体也不沿用快照）。
    const prevCard = { tool: 'search_students', rows: [{ name: '叶予禾', remainingLessons: 7 }], filters: { keyword: '叶予禾' }, error: null } as unknown as Evidence;
    expect(entitySwapFollowupIntent('2026年12月31日，叶予禾还剩几节课？', [prevCard])).toBeUndefined();
    expect(entitySwapFollowupIntent('叶予禾呢？', [prevCard])).toBeDefined();
  });
  it('binds the two named periods for sums, else asks the user to pick (复验 J2)', () => {
    // 会话内最近优先的三段：10 月整月 + 两个周。
    const windows = [
      { start: '2026-10-01', end: '2026-10-31' },
      { start: '2026-11-09', end: '2026-11-15' },
      { start: '2026-11-02', end: '2026-11-08' },
    ];
    // 问句点名“两周”：只允许周粒度窗口，10 月整月被排除，绑定的正是讨论过的两周。
    const named = bindSumWindows('前面两周的成交金额合计多少？', windows);
    expect(named.bound).toEqual([
      { start: '2026-11-09', end: '2026-11-15' },
      { start: '2026-11-02', end: '2026-11-08' },
    ]);
    // 未点名粒度（两期）：仍取最近两段。
    const generic = bindSumWindows('前面两期的合计多少', windows);
    expect(generic.bound).toEqual([
      { start: '2026-10-01', end: '2026-10-31' },
      { start: '2026-11-09', end: '2026-11-15' },
    ]);
    // 点名两周但会话里只有一个周窗口：不能唯一确定，返回 null 并给出全部候选。
    const onlyMonth = bindSumWindows('前面两周合计多少', [{ start: '2026-10-01', end: '2026-10-31' }]);
    expect(onlyMonth.bound).toBeNull();
    expect(onlyMonth.candidates).toEqual([{ start: '2026-10-01', end: '2026-10-31' }]);
    // 两月粒度：会话里只有一个月窗口，不能唯一确定两月，澄清并列出候选。
    const monthUnit = bindSumWindows('前面两个月合计多少', windows);
    expect(monthUnit.bound).toBeNull();
    expect(monthUnit.candidates).toHaveLength(3);
  });
  it('re-paths when the user names a subject/course-like object in any common phrasing (复验 J3)', () => {
    const prev = [{ tool: 'teacher_performance_ranking', rows: [{ 老师: '周老师', 个人成单额: 16935 }], filters: { metric: 'sales', scope: 'teachers', direction: 'max' },
      timeRange: { start: '2026-10-01', end: '2026-10-31' }, error: null } as unknown as Evidence];
    expect(rankFollowupBinding('我换个问题，十月份哪个学科成交额最高', prev, '2026-11-22')).toBeUndefined();
    expect(rankFollowupBinding('哪个科目的成单额最高', prev, '2026-11-22')).toBeUndefined();
    expect(rankFollowupBinding('把顾问也算上，谁第一', prev, '2026-11-22')).toBeDefined();
    expect(localBusinessIntent('我换个问题，十月份哪个学科成交额最高？', '2026-11-22').reply).toContain('学科');
  });
});
