import { describe, expect, it } from 'vitest';
import { criticalMetricClarification, explanationIntent, generalAttendanceAdvice, inheritPreviousIntent, studentBalanceIntent } from '../src/services/aiWorkbenchPolicy';
import { rankFollowupBinding } from '../src/services/aiQueryBinding';
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
});
