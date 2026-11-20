import { Prisma, type Student } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import { readStudentLedger } from './lessonLedger';
import { printedOrderId, readOrderEvidence } from './lessonOrderEvidence';

export function refundDay(value: unknown, label: string, end = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApiError(label + '应为 YYYY-MM-DD', 400, 'INVALID_DATE');
  const day = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== value)
    throw new ApiError(label + '无效', 400, 'INVALID_DATE');
  return new Date(value + (end ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00'));
}

// A refund without a lesson debit still draws on the same student's contract
// receipts. Reversed consumption and cancelled refunds do not spend cash.
export async function quoteRefund(tx: Prisma.TransactionClient, student: Student, lessons: number) {
  const scope = { organizationId: student.organizationId, studentId: student.id };
  const ledger = await readStudentLedger(tx, student, student.organizationId);
  const balance = ledger.balance;
  const inventory = ledger.take(student.remainingLessons, 'any');
  ledger.apply(inventory,true);
  const planned = ledger.take(lessons, 'any');
  const [orders, pricing, debits, refunded, credits] = await Promise.all([
    tx.conversion.findMany({ where: { ...scope, approvalStatus: 'confirmed',
      OR: [{ classId: null }, { class: { organizationId: student.organizationId, campusId: student.campusId } }] },
      select: { id: true, price: true } }),
    tx.lessonBatchPricing.findMany({ where: { ...scope, ...(student.campusId ? {campusId:student.campusId} : {}) },
      select: { creditLogId: true, orderId: true, basisType: true } }),
    tx.lessonLog.findMany({ where: { ...scope, type: 'deduct' }, select: { id: true, lessons: true } }),
    tx.refund.aggregate({ where: { ...scope, status: 'approved' }, _sum: { amountToRefund: true } }),
    tx.lessonLog.findMany({where:{...scope,type:'add',scheduleId:null,reversalOfId:null,refundId:null},
      select:{id:true,conversionId:true,notes:true}}),
  ]);
  const provenance = await readOrderEvidence(tx, student.organizationId, orders.map(order => order.id));
  const confirmed = new Map(orders.filter(order => provenance.allows(order.id, student.id)).map(order => [order.id, order.price]));
  const supplements = new Map(pricing.map(b=>[b.creditLogId,b]));
  const sources = new Map(credits.map(c=>[c.id,c.conversionId ?? printedOrderId(c.notes)]));
  // A historical renewal receipt may reconstruct an original posting with a synthetic lot ID.
  for (const id of confirmed.keys()) if (ledger.creditDetail('renewal:'+id)) sources.set('renewal:'+id,id);
  let receipts = new Prisma.Decimal(0);
  const fundedLots = new Set<string>();
  const usedOrders = new Set<string>();
  for (const [lotId,linkedOrder] of sources) {
    const lot = ledger.creditDetail(lotId);
    if (!lot?.traceable || lot.retired || lot.source==='gift' || lot.cents===null) continue;
    const batch = supplements.get(lotId);
    const orderId = batch?.orderId ?? linkedOrder;
    const amount = new Prisma.Decimal(lot.cents).div(100);
    if (orderId) {
      const faceAmount = confirmed.get(orderId);
      if (usedOrders.has(orderId) || faceAmount===undefined || (faceAmount===null && !batch) || (faceAmount && amount.gt(faceAmount))) continue;
      usedOrders.add(orderId);
    } else if (batch?.basisType!=='manualVoucher') continue;
    // A partial import contributes only its posted batch value. An unposted
    // contract contributes nothing even when it has a confirmed face amount.
    receipts = receipts.plus(amount);
    fundedLots.add(lotId);
  }
  const verified = (lotId:string) => fundedLots.has(lotId) || ledger.creditDetail(lotId)?.source==='gift';
  for (const part of inventory) {
    if (part.amountCents !== null && !verified(part.lotId)) {
      balance.paidRemainingLessons -= part.lessons;
      balance.unpricedRemainingLessons += part.lessons;
    }
  }
  const allocations = planned.map(part=>verified(part.lotId) ? part : {...part,amountCents:null});
  let netConsumed = 0;
  let unresolvedConsumption = false;
  let spent = new Prisma.Decimal(0);
  for (const debit of debits) {
    if (ledger.reversed.has(debit.id)) continue;
    netConsumed += debit.lessons;
    const valuation = ledger.valuations.get(debit.id);
    if (!valuation) { unresolvedConsumption = true; continue; }
    for (const part of valuation.allocations) {
      // Spending attached to a voided purchase is already excluded with its receipt.
      if (ledger.creditDetail(part.lotId)?.retired) continue;
      if (part.amountCents === null || (!verified(part.lotId) && !sources.has(part.lotId))) unresolvedConsumption = true;
      else if (fundedLots.has(part.lotId)) spent = spent.plus(new Prisma.Decimal(part.amountCents).div(100));
    }
  }
  const unpricedCashOnly = !lessons && receipts.eq(0) && (balance.unpricedRemainingLessons>0 || [...confirmed.values()].some(p=>p===null));
  const cashCertain = !unpricedCashOnly && !unresolvedConsumption && netConsumed === student.consumedLessons;
  const cashAvailable = Prisma.Decimal.max(0, receipts.minus(spent).minus(refunded._sum.amountToRefund ?? 0));
  const unpricedLessons = allocations.filter(part => part.amountCents === null).reduce((n,p) => n+p.lessons,0);
  const giftLessons = allocations.filter(part => ledger.creditDetail(part.lotId)?.source === 'gift').reduce((n,p) => n+p.lessons,0);
  const knownAmount = allocations.reduce((sum,part) => sum.plus(part.amountCents ?? 0), new Prisma.Decimal(0)).div(100);
  let maxAmount: number|null = null;
  if (!unpricedLessons) {
    if (lessons && knownAmount.eq(0)) maxAmount = 0;
    else if (cashCertain) maxAmount = (lessons ? Prisma.Decimal.min(knownAmount,cashAvailable) : cashAvailable).toNumber();
  }
  return { studentId: student.id, remainingLessons: student.remainingLessons, ...balance, lessonsToRefund: lessons,
    allocations, giftLessons, unpricedLessons, knownAmount: knownAmount.toNumber(),
    cashAvailable: cashCertain ? cashAvailable.toNumber() : null, maxAmount };
}

export function validateRefundQuote(quote: Awaited<ReturnType<typeof quoteRefund>>, amount: Prisma.Decimal) {
  if (quote.maxAmount === null)
    throw new ApiError('所选课时或历史课消金额待核，请先核对原始购课批次与课消记录',409,'REFUND_PRICE_UNVERIFIED');
  if (amount.gt(quote.maxAmount))
    throw new ApiError('退费金额超过本次可退上限 ¥' + quote.maxAmount.toFixed(2),409,'REFUND_EXCEEDS_PAID');
}

export function requireFullRefund(remainingLessons: number, lessonsToRefund: number) {
  if (lessonsToRefund !== remainingLessons)
    throw new ApiError('不允许部分退费，请退回全部剩余课时；课时如有变化请刷新后重新核对',409,'PARTIAL_REFUND_NOT_ALLOWED');
}
