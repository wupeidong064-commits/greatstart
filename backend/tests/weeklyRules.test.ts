import { describe, expect, it } from 'vitest';
import { normalizeWeeklyRules, previewWeeklyOccurrences } from '../src/services/weeklyRules';

// 与需求方隔离开发版 weeklyRules.test.ts 同一套断言：多时段、上海时区、结束日、
// 无效日期、空区间、跨度、跨日及重叠。
describe('班级常规每周规则', () => {
  const rules = [
    { weekday: 2, startTime: '18:00', endTime: '19:00', classroom: ' A101 ' },
    { weekday: 6, startTime: '10:00', endTime: '11:30', classroom: null },
  ];

  it('按北京时间展开多时段并包含结束日', () => {
    const generated = previewWeeklyOccurrences(rules, '2026-11-10', '2026-11-14');
    expect(generated.map(row => row.businessDate)).toEqual(['2026-11-10', '2026-11-14']);
    expect(generated[0].startTime.toISOString()).toBe('2026-11-10T10:00:00.000Z');
    expect(generated[0].classroom).toBe('A101');
    expect(generated[1].endTime.toISOString()).toBe('2026-11-14T03:30:00.000Z');
  });

  it('拒绝无效日期、倒置区间、空匹配和超跨度', () => {
    expect(() => previewWeeklyOccurrences(rules, '2026-02-31', '2026-03-07')).toThrow(/日期无效/);
    expect(() => previewWeeklyOccurrences(rules, '2026-11-10', '2026-11-09')).toThrow(/结束日期/);
    expect(() => previewWeeklyOccurrences(rules, '2026-11-11', '2026-11-13')).toThrow(/没有符合规则/);
    expect(() => previewWeeklyOccurrences(rules, '2026-01-01', '2027-01-03')).toThrow(/最多366天/);
  });

  it('拒绝跨日与同日重叠时段，允许首尾相接', () => {
    expect(() => normalizeWeeklyRules([{ weekday: 2, startTime: '22:00', endTime: '01:00' }])).toThrow(/不支持跨日/);
    expect(() => normalizeWeeklyRules([
      { weekday: 2, startTime: '18:00', endTime: '19:00' },
      { weekday: 2, startTime: '18:30', endTime: '20:00' },
    ])).toThrow(/不能重叠/);
    expect(normalizeWeeklyRules([
      { weekday: 2, startTime: '18:00', endTime: '19:00' },
      { weekday: 2, startTime: '19:00', endTime: '20:00' },
    ]).length).toBe(2);
  });
});
