export type PricingBasis = 'existingOrder' | 'manualVoucher';
export interface PricingRequest {
  studentId: string;
  creditLogId: string;
  requestId: string;
  amount: number;
  basisType: PricingBasis;
  orderId?: string;
  notes: string;
}
export interface PricingOrder {
  orderId: string;
  originalLessons: number;
  amount: number;
  conversionDate?: string | null;
}
export interface PricingBatch {
  creditLogId: string;
  originalLessons: number;
  remainingLessons: number | null;
  unpricedConsumedLessons: number | null;
  amount: number | null;
  pricingStatus: 'priced' | 'unpriced' | 'gift';
  canPrice: boolean;
  reason: string | null;
  businessDate?: string | null;
  createdAt?: string;
  orderCandidates: PricingOrder[];
}
const nonnegative = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const validPrice = (v: unknown): v is number =>
  typeof v === 'number' &&
  nonnegative(v) &&
  v <= 99999999.99 &&
  Math.abs(Math.round(v * 100) - v * 100) < 0.00001;

export function parsePricing(data: unknown, studentId: string): PricingBatch[] {
  const result = data as { studentId?: string; batches?: PricingBatch[] } | null;
  if (
    result?.studentId !== studentId ||
    !Array.isArray(result.batches) ||
    !result.batches.every(
      (b) =>
        b &&
        typeof b.creditLogId === 'string' &&
        nonnegative(b.originalLessons) &&
        typeof b.canPrice === 'boolean' &&
        ['priced', 'gift', 'unpriced'].includes(b.pricingStatus) &&
        (b.amount === null || validPrice(b.amount)) &&
        [b.remainingLessons, b.unpricedConsumedLessons].every(
          (n) => n === null || nonnegative(n)
        ) &&
        Array.isArray(b.orderCandidates) &&
        b.orderCandidates.every(
          (o) =>
            o &&
            typeof o.orderId === 'string' &&
            nonnegative(o.originalLessons) &&
            validPrice(o.amount)
        )
    )
  )
    throw new Error('批次信息不完整，请重新加载');
  return result.batches;
}

export function readPricingRequest(key: string, studentId: string): PricingRequest | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    const p = JSON.parse(raw);
    if (
      !p ||
      p.studentId !== studentId ||
      typeof p.creditLogId !== 'string' ||
      !p.creditLogId ||
      !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(p.requestId) ||
      !validPrice(p.amount) ||
      typeof p.notes !== 'string' ||
      !p.notes.trim() ||
      !['manualVoucher', 'existingOrder'].includes(p.basisType) ||
      (p.basisType === 'existingOrder' && (!p.orderId || typeof p.orderId !== 'string'))
    )
      throw new Error();
    return p;
  } catch {
    throw new Error('这个学员有无法读取的待确认补价记录，请核对后再提交。');
  }
}

export function persistPricingRequest(key: string, request: PricingRequest) {
  const existing = readPricingRequest(key, request.studentId);
  if (existing) return existing;
  localStorage.setItem(key, JSON.stringify(request));
  const saved = readPricingRequest(key, request.studentId);
  if (!saved) throw new Error('无法保存补价重试记录，请检查浏览器存储。');
  return saved;
}
export function clearPricingRequest(key: string, request: PricingRequest) {
  if (readPricingRequest(key, request.studentId)?.requestId === request.requestId)
    localStorage.removeItem(key);
}
export function confirmedPricing(
  value: unknown,
  request: PricingRequest,
  originalLessons?: number
) {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PricingRequest> & { originalLessons?: number };
  return (
    v.requestId === request.requestId &&
    v.studentId === request.studentId &&
    v.creditLogId === request.creditLogId &&
    v.basisType === request.basisType &&
    v.notes === request.notes &&
    (v.orderId ?? null) === (request.orderId ?? null) &&
    validPrice(v.amount) &&
    Math.round(v.amount * 100) === Math.round(request.amount * 100) &&
    nonnegative(v.originalLessons) &&
    (originalLessons === undefined || v.originalLessons === originalLessons)
  );
}
