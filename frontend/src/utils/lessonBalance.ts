export type LessonSource = 'paid' | 'gift';

export interface LessonBalance {
  paidRemainingLessons: number;
  giftRemainingLessons: number;
  unpricedRemainingLessons: number;
}

export function readLessonBalance(data: unknown): LessonBalance | null {
  if (!data || typeof data !== 'object') return null;
  const balance = data as LessonBalance;
  if (
    ![
      balance.paidRemainingLessons,
      balance.giftRemainingLessons,
      balance.unpricedRemainingLessons,
    ].every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    return null;
  return balance;
}

export function availableLessons(balance: LessonBalance, source: LessonSource) {
  return source === 'gift'
    ? balance.giftRemainingLessons
    : balance.paidRemainingLessons + balance.unpricedRemainingLessons;
}

export function lessonBalanceText(balance: LessonBalance | null) {
  if (!balance) return '分项余额暂不可用';
  const pending = balance.unpricedRemainingLessons
    ? `（含 ${balance.unpricedRemainingLessons} 节待核）`
    : '';
  return `付费可用 ${availableLessons(balance, 'paid')} 节${pending} · 赠课 ${balance.giftRemainingLessons} 节`;
}
