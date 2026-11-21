import { describe, expect, it } from 'vitest';
import { criticalMetricClarification, explanationIntent, generalAttendanceAdvice, inheritPreviousIntent } from '../src/services/aiWorkbenchPolicy';
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
      name:'teacher_performance_ranking', params:{ metric:'attendance', startDate:'2026-05-22', endDate:'2026-11-21' },
    }]);
    expect(resolveBusinessCalendar({question:'过去六个月',today:'2026-11-21'}).observation).toEqual(calendar.observation);
    expect(resolveBusinessCalendar({question:'最近半年',today:'2026-08-31'}).observation).toEqual({start:'2026-03-01',end:'2026-08-31'});
    expect(teacherRankingIntent('最近半年哪位老师成单额最高')?.tools?.[0].params).toEqual({metric:'sales'});
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
});
