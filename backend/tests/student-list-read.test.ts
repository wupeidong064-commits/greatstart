import { describe, it, expect } from 'vitest';
import { latestRenewalFilter, recallableFromNotes } from '../src/services/studentListRead';

describe('名单筛选日期边界', () => {
  it('最近续费范围必须排除结束日之后另有有效续费的学员', () => {
    const where = latestRenewalFilter({ lastRenewalStartDate: '2026-11-01', lastRenewalEndDate: '2026-11-02' }, 'org');
    expect(where).toMatchObject({ AND: [
      { conversions: { some: { organizationId: 'org', approvalStatus: 'confirmed', conversionDate: { gte: '2026-11-01', lte: '2026-11-02' } } } },
      { conversions: { none: { organizationId: 'org', approvalStatus: 'confirmed', conversionDate: { gt: '2026-11-02' } } } },
    ] });
  });
  it.each(['2026-02-30', '2026-13-01', '', ['2026-11-01']])('拒绝无效日期而非悄悄忽略：%s', value => {
    expect(() => latestRenewalFilter({ lastRenewalStartDate: value }, 'org')).toThrow();
  });
  it('拒绝倒置范围，清除条件不再过滤', () => {
    expect(() => latestRenewalFilter({ lastRenewalStartDate: '2026-11-02', lastRenewalEndDate: '2026-11-01' }, 'org')).toThrow();
    expect(latestRenewalFilter({}, 'org')).toEqual({});
  });
  const now = new Date('2026-11-13T23:59:59+08:00');
  it('按北京时间自然日含第7日，过期也可召回', () => {
    expect(recallableFromNotes('备注\n预计召回时间:2026-11-20', now)).toBe(true);
    expect(recallableFromNotes('预计召回时间:2026-11-21', now)).toBe(false);
    expect(recallableFromNotes('预计召回时间:2026-01-01', now)).toBe(true);
  });
  it('保留历史ISO日期；无效或缺日期不误报可召回', () => {
    expect(recallableFromNotes('预计召回时间:2026-11-20T00:00:00.000Z', now)).toBe(true);
    for (const notes of [null, '', '预计召回时间:2026-02-30', '预计召回时间:not-a-date']) expect(recallableFromNotes(notes, now)).toBe(false);
  });
});
