export type RefundConfirmPayload = {
  requestId: string; studentId: string; amountToRefund: number; lessonsToRefund: number; reason: string; refundDate: string;
};
export type PendingRefundConfirm = { payload: RefundConfirmPayload; studentName: string; remainingLessons: number; feeRate: number };
export function refundConfirmStorageKey(organizationId: string | undefined, userId: string) {
  if (!organizationId) throw new Error('未分配机构，无法登记退费');
  return `pending-refund-confirm:v1:${JSON.stringify([organizationId, userId])}`;
}
export function readPendingRefundConfirm(key: string): PendingRefundConfirm | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw), p = value?.payload;
    if (!p || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.requestId) || typeof p.studentId !== 'string' || !Number.isFinite(p.amountToRefund) || !Number.isSafeInteger(p.lessonsToRefund) || typeof p.reason !== 'string' || typeof p.refundDate !== 'string') throw new Error('invalid');
    return value;
  } catch { throw new Error('有无法读取的待确认退费记录，请先联系管理员核对记录'); }
}
export function savePendingRefundConfirm(key: string, pending: PendingRefundConfirm) {
  const raw = JSON.stringify(pending);
  sessionStorage.setItem(key, raw);
  if (sessionStorage.getItem(key) !== raw) throw new Error('无法保存退费重试记录，请检查浏览器存储后再提交');
}
export function sameRefundConfirmPayload(a: RefundConfirmPayload, b: Omit<RefundConfirmPayload, 'requestId'>) {
  return a.studentId === b.studentId && a.amountToRefund === b.amountToRefund && a.lessonsToRefund === b.lessonsToRefund && a.reason === b.reason && a.refundDate === b.refundDate;
}
