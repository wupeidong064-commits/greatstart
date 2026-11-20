import { beforeEach, describe, expect, it, vi } from 'vitest';
const { readLedgers } = vi.hoisted(() => ({ readLedgers: vi.fn() }));
vi.mock('../src/services/lessonLedger', () => ({ readLessonLedgers: readLedgers }));
vi.mock('../src/services/scheduleAttendanceService', () => ({ businessDate: (date: Date) => date.toISOString().slice(0, 10) }));
import { consumptionMoney, readConsumptionValuation } from '../src/services/consumptionValuation';
import { actualAmount } from '../../frontend/src/utils/actualConsumption';

const scope = { organizationId: 'org', campusId: 'campus' };
const debit = (id: string, lessons = 1) => ({ id, studentId: 'student', scheduleId: 'schedule', lessons });
const value = (amountCents: number, unpricedLessons = 0) => ({ amountCents, unpricedLessons, lessonSource: 'paid', allocations: [] });
function fixture(debits: ReturnType<typeof debit>[], values: [string, ReturnType<typeof value>][], returns: any[] = [], ambiguousDebits = new Set()) {
  const tx = { lessonLog: { findMany: vi.fn().mockResolvedValueOnce(debits).mockResolvedValueOnce(returns) }, student: { findMany: vi.fn().mockResolvedValue([{ id: 'student', remainingLessons: 0 }]) } };
  readLedgers.mockResolvedValue(new Map([['student', { valuations: new Map(values), ambiguousDebits }]]));
  return tx;
}
beforeEach(() => vi.clearAllMocks());
describe('实际课消缺价默认零元', () => {
  it('全部缺价返回0，保留内部原始依据字段', () => {
    const report = consumptionMoney({ cents: 0, unpricedLessons: 3 });
    expect(report).toMatchObject({ actualConsumptionAmount: 0, unpricedConsumptionLessons: 3, monetaryHistoryComplete: false });
    expect(actualAmount(report)).toBe(0);
  });
  it('已知700元和3节缺价按700元展示并可比较，负数及空数据不被误归零', () => {
    const now = consumptionMoney({ cents: 70000, unpricedLessons: 3 });
    const before = consumptionMoney({ cents: 20000, unpricedLessons: 1 });
    expect(actualAmount(now)! - actualAmount(before)!).toBe(500);
    expect(actualAmount({ actualConsumptionAmount: -100 })).toBe(-100);
    expect(actualAmount(undefined)).toBeNull();
    expect(actualAmount({ actualConsumptionAmount: null })).toBeNull();
    expect(actualAmount({ actualConsumptionAmount: Number.NaN })).toBeNull();
  });
  it('正常付费、赠课和缺价混合累计，不改变数量及原始核销值', async () => {
    const paid = value(10000), gift = { ...value(0), lessonSource: 'gift' }, unknown = value(0, 3);
    const tx = fixture([debit('paid'), debit('gift'), debit('unknown', 3)], [['paid', paid], ['gift', gift], ['unknown', unknown]]);
    const result = await readConsumptionValuation(tx as any, scope, ['schedule']);
    expect(result).toMatchObject({ actualConsumptionAmount: 100, knownConsumptionAmount: 100, unpricedConsumptionLessons: 3 });
    expect(result.bySchedule.get('schedule')).toEqual({ cents: 10000, unpricedLessons: 3 });
    expect(unknown.unpricedLessons).toBe(3); expect(paid.amountCents).toBe(10000);
    expect(tx.lessonLog.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', student: scope, type: 'deduct' });
  });
  it('取消原付费划课按原金额返还，缺价课不挡住正常冲回', async () => {
    const tx = fixture([debit('paid'), debit('unknown', 3)], [['paid', value(10000)], ['refund', value(10000)], ['unknown', value(0, 3)]], [{ ...debit('refund'), reversalOfId: 'paid' }]);
    const result = await readConsumptionValuation(tx as any, scope, ['schedule']);
    expect(result.actualConsumptionAmount).toBe(0); expect(result.unpricedConsumptionLessons).toBe(3);
  });
  it('取消缺价划课金额仍0，不影响其他付费金额', async () => {
    const tx = fixture([debit('paid'), debit('unknown', 3)], [['paid', value(10000)], ['unknown', value(0, 3)], ['refund', value(0, 3)]], [{ ...debit('refund', 3), reversalOfId: 'unknown' }]);
    const result = await readConsumptionValuation(tx as any, scope, ['schedule']);
    expect(result.actualConsumptionAmount).toBe(100); expect(result.unpricedConsumptionLessons).toBe(0);
  });
  it('外学生冲回及冲突记录不能制造负课消', async () => {
    const tx = fixture([debit('paid'), debit('conflict')], [['paid', value(10000)], ['conflict', value(10000)], ['bad-return', value(50000)]], [{ ...debit('bad-return'), reversalOfId: 'paid', studentId: 'other' }], new Set(['conflict']));
    const result = await readConsumptionValuation(tx as any, scope, ['schedule']);
    expect(result.actualConsumptionAmount).toBe(100); expect(result.unpricedConsumptionLessons).toBe(1);
  });
  it('空区间明确0，无范围时不查询其他机构或全库', async () => {
    const tx = fixture([], []);
    expect((await readConsumptionValuation(tx as any, scope, [])).actualConsumptionAmount).toBe(0);
    expect(tx.lessonLog.findMany).not.toHaveBeenCalled();
  });
});
