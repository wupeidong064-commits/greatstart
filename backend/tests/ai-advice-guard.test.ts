import { describe, expect, it } from 'vitest';
import { guardManagementAdvice, isManagementAdvice } from '../src/services/aiAdviceGuard';

describe('management advice presentation', () => {
  const card = { tool: 'low_attendance_students', timeRange: { start: '2026-10-17', end: '2026-11-16' },
    rows: [...Array.from({ length: 5 }, () => ({ 出勤率: 0 })), ...Array.from({ length: 3 }, () => ({ 出勤率: 50 }))] };
  it('replaces the real failure of 4+4 with a distribution computed from all eight records', () => {
    const out = guardManagementAdvice('当前8人，其中4人出勤率为0%、4人为50%。\n建议加强联系。', [card]);
    expect(out).not.toContain('4人');
    expect(out).toContain('0%：5条；50%：3条');
    expect(out).toContain('同一学员可能有多条记录');
    expect(out).toContain('AI 建议仅供参考');
    expect(out).toContain('建议加强联系');
  });
  it('does not count only the first eight rows, or count missing rates as zero', () => {
    const rows = [...card.rows, { 出勤率: 50 }, { 出勤率: null }];
    const out = guardManagementAdvice('0%有五人。', [{ ...card, rows }]);
    expect(out).toContain('0%：5条；50%：4条');
    expect(out).not.toContain('null');
  });
  it('preserves suggestions and does not duplicate an existing explicit notice', () => {
    expect(guardManagementAdvice('建议先了解现行薪资。\nAI 建议仅供参考。', [])).toBe('建议先了解现行薪资。\nAI 建议仅供参考。');
  });
  it('recognizes advice without labeling ordinary business queries', () => {
    expect(isManagementAdvice('想调整薪资结构，你有什么建议')).toBe(true);
    expect(isManagementAdvice('针对老师的表现制定下个月的目标')).toBe(true);
    expect(isManagementAdvice('本月到课人数多少')).toBe(false);
  });
});
