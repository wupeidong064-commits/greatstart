import { describe, expect, it } from 'vitest';
import {
  alignMeasures,
  bindUserThreshold,
  requestsTable,
  scopeClarification,
} from '../src/services/aiQueryRequirements';
import { calendarTools } from '../src/services/aiOperatingPlan';
import { renderOperatingAdvice } from '../src/services/aiOperatingAdvice';
import type { AiIntent } from '../src/services/aiIntent';
import type { OperatingFact } from '../src/services/aiOperatingFacts';
const calendar = {
  observation: { start: '2026-10-01', end: '2026-10-31' },
  target: { start: '2026-12-01', end: '2026-12-31' },
  asOfDate: '2026-11-16',
  explicit: true,
};

describe('经营查询输入必须来自本轮原文或已授权快照', () => {
  const candidate: AiIntent = {
    parsedOk: true,
    tools: [{ name: 'low_attendance_students', params: { threshold: 0.6, endDate: '2022-01-03' } }],
  };
  it.each([
    ['查低出勤分布', undefined],
    ['低于六成', 60],
    ['严格不到五成，正好五成先不计', 50],
    ['百分之五十以下', 50],
    ['出勤率低于0.6%', 0.6],
    ['百分之六十以下', 60],
    ['低于九成', 90],
  ])('显式阈值 %s', (q, value) => {
    expect(bindUserThreshold(candidate, String(q)).tools?.[0].params.threshold).toBe(value);
  });
  it('无单位阈值先澄清，复用快照保留已确认筛选', () => {
    expect(bindUserThreshold(candidate, '出勤率低于0.6').reply).toContain('阈值');
    expect(bindUserThreshold(candidate, '换成上月', true)).toEqual(candidate);
  });
  it('服务端绑定两个期间，模型不能更改查询边界', () => {
    const previous = { start: '2026-09-01', end: '2026-09-30' };
    expect(
      calendarTools(candidate, { ...calendar, comparison: previous }).map((t) => [
        t.params.startDate,
        t.params.endDate,
      ])
    ).toEqual([Object.values(calendar.observation), Object.values(previous)]);
  });
  it('夹带的快照和金额工具不能代替历史率和用户目标', () => {
    const q = alignMeasures(
      { parsedOk: true, tools: [{ name: 'signup_renewal', params: { userTargetPercent: 100 } }] },
      '如果把续费率定在七成，达标了吗'
    );
    expect(q.tools).toEqual([{ name: 'renewal_rate', params: { userTargetPercent: 70 } }]);
    expect(alignMeasures(q, '十月续费率是多少').tools?.[0].params).toEqual({});
  });
  it('同名学员的历史指标使用姓名对应的历史记录', () => {
    expect(
      alignMeasures(
        {
          parsedOk: true,
          entities: { student: '夏禾' },
          tools: [{ name: 'search_students', params: {} }],
        },
        '想知道夏禾出勤几次'
      ).tools
    ).toEqual([{ name: 'student_attendance', params: { studentName: '夏禾' } }]);
  });
  it('选择正文表格不要求导出附件', () =>
    expect(requestsTable('排成一个小表，直接在这里看', {})).toBeTruthy());
  it('跨校区拒绝且不会误拒显式本校与普通经营问题', () => {
    for (const q of ['改看青峦权限对照校区十月份', '跨校区经营'])
      expect(scopeClarification(q, '四季校区')).toContain('超出');
    for (const q of ['四季校区的经营情况', '想调整校区薪资', '查询本校区'])
      expect(scopeClarification(q, '四季校区')).toBeUndefined();
  });
  it('草案示例按个人分子分母绑定；正文提示只出现一次', () => {
    const f = {
      metric: 'lessons.rate',
      period: calendar.observation,
      entityName: '甲老师',
      coverage: 'complete',
      numerator: 3,
      denominator: 10,
    } as OperatingFact;
    const g = { ...f, entityName: '乙老师', numerator: 10 };
    const answer = renderOperatingAdvice('teacher', ['teacher.attendance', '伪造实绩'], calendar, {
      version: 'v',
      facts: [f, g],
    });
    expect(answer).toMatch(/甲老师[^\n]*4 ÷ 10 ≈ 40%/);
    expect(answer).toMatch(/乙老师[^\n]*10 ÷ 10 ≈ 100%/);
    expect(answer).not.toContain('伪造实绩');
    expect(answer.match(/仅供参考/g)).toHaveLength(1);
  });
});
