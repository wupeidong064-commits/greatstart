import { readOrderEvidence, printedOrderId } from './lessonOrderEvidence';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { studentAccess } from '../utils/studentAccess';
import { lockEnrollmentStudent } from './enrollmentPeriod';
import { readLessonLedgers } from './lessonLedger';
import { parseLessonAmount } from './lessonMoney';

type Scope = {organizationId:string;campusId:string};
type Student = {id:string;remainingLessons:number};
const ref = (r:{conversionId:string|null;notes:string|null})=>r.conversionId ?? printedOrderId(r.notes);
const uuid = z.uuid();
function access(req:AuthRequest) {
  const result=studentAccess(req);
  if (!result.management || result.actor.isPlatformAdmin) throw new ApiError('仅本校区管理员或经理可核对课时计价',403,'FORBIDDEN');
  return result;
}
async function scopedStudent(tx:Prisma.TransactionClient,id:string,scope:Scope) {
  const student=await tx.student.findFirst({where:{id,...scope},select:{id:true,remainingLessons:true}});
  if (!student) throw new ApiError('学员不在当前校区',403,'FORBIDDEN');
  return student;
}

async function state(tx:Prisma.TransactionClient,student:Student,scope:Scope) {
  const organizationId=scope.organizationId, studentId=student.id;
  const [ledgerMap,rows,orders]=await Promise.all([
    readLessonLedgers(tx,[student],organizationId),
    tx.lessonLog.findMany({where:{organizationId,studentId},orderBy:[{createdAt:'asc'},{id:'asc'}],
      select:{id:true,type:true,lessons:true,scheduleId:true,reversalOfId:true,refundId:true,conversionId:true,
        lessonSource:true,creditAmountCents:true,businessDate:true,createdAt:true,notes:true}}),
    tx.conversion.findMany({where:{organizationId,studentId,OR:[{classId:null},{class:scope}]},
      select:{id:true,totalLessons:true,price:true,conversionDate:true,approvalStatus:true}}),
  ]);
  const ledger=ledgerMap.get(studentId)!;
  const orderIds=orders.map(o=>o.id);
  const [provenance,supplements]=await Promise.all([
    readOrderEvidence(tx,organizationId,orderIds),
    tx.lessonBatchPricing.findMany({where:{orderId:{in:orderIds}},select:{orderId:true,creditLogId:true}}),
  ]);
  const batches=rows.filter(r=>r.type==='add' && !r.scheduleId && !r.reversalOfId && !r.refundId &&
    !r.notes?.startsWith('退费取消返还')).map(r=>{
    const lot=ledger.creditDetail(r.id), linked=ref(r), order=linked && orders.find(o=>o.id===linked);
    const gift=r.lessonSource==='gift' || lot?.source==='gift';
    const cents=lot?.cents ?? r.creditAmountCents?.toNumber() ?? null;
    const amount=cents===null?null:cents/100;
    const original=!!linked || r.notes==='建档初始课时';
    const contradictory = linked && (!provenance.allows(linked,studentId,r.id,true) ||
      r.conversionId && printedOrderId(r.notes) && r.conversionId!==printedOrderId(r.notes));
    const reason=gift ? '独立赠课按0元核销' : contradictory ? '原单入账或续费凭据存在冲突，请先核对原单' : lot?.retired || linked && (!order || !['confirmed','pending'].includes(order.approvalStatus)) ?
      '原订单已作废或不在当前负责范围' : amount!==null ? '该批次已有总价' :
      order && order.price!==null ? '原单已有成交金额，原课时范围无法唯一核定' :
      !original ? '流水未标明购买或建档来源' : ledger.reconciliationRequired || !lot?.traceable ?
      '原批次与历史扣课区间无法唯一匹配，请先核对流水' : null;
    const candidates=reason ? [] : orders.filter(o=>o.approvalStatus==='confirmed' && o.price!==null && o.totalLessons===r.lessons &&
      (!linked || linked===o.id) && provenance.allows(o.id,studentId,r.id,linked===o.id) &&
      !supplements.some(v=>v.orderId===o.id && v.creditLogId!==r.id));
    const unpricedConsumedLessons=rows.filter(x=>x.type==='deduct' && !ledger.reversed.has(x.id)).reduce((n,x)=>n+
      (ledger.valuations.get(x.id)?.allocations.reduce((m,p)=>m+(p.lotId===r.id && p.amountCents===null?p.lessons:0),0) ?? 0),0);
    return {creditLogId:r.id,originalLessons:r.lessons,remainingLessons:lot?.traceable ? lot.remaining : null,unpricedConsumedLessons,
      businessDate:r.businessDate,createdAt:r.createdAt,amount,pricingStatus:gift?'gift':amount===null?'unpriced':'priced',
      canPrice:reason===null,reason,orderCandidates:candidates.map(o=>({orderId:o.id,originalLessons:o.totalLessons!,amount:o.price!.toNumber(),conversionDate:o.conversionDate}))};
  });
  return {studentId,batches,unpricedRemainingLessons:ledger.balance.unpricedRemainingLessons};
}

export async function getLessonPricing(req:AuthRequest) {
  const {campus}=access(req), id=req.query.studentId;
  if (typeof id!=='string' || !id) throw new ApiError('请选择学员',400,'INVALID_PRICING');
  return prisma.$transaction(async tx=>state(tx,await scopedStudent(tx,id,campus),campus),{isolationLevel:'RepeatableRead'});
}

type Receipt = {studentId:string;creditLogId:string;originalLessons:number;amountCents:Prisma.Decimal;basisType:string;orderId:string|null;notes:string;requestId:string;createdAt:Date};
const response = (r:Receipt)=>({studentId:r.studentId,creditLogId:r.creditLogId,originalLessons:r.originalLessons,
  amount:r.amountCents.toNumber()/100,basisType:r.basisType,orderId:r.orderId,notes:r.notes,requestId:r.requestId,createdAt:r.createdAt});

export async function confirmLessonPricing(req:AuthRequest) {
  const {campus,actor}=access(req);
  const input=req.body || {}, {studentId,creditLogId,basisType}=input, parsed=uuid.safeParse(input.requestId);
  const orderId=input.orderId==null ? null : input.orderId;
  const notes=typeof input.notes==='string' ? input.notes.trim() : '';
  if (!parsed.success || typeof studentId!=='string' || !studentId || typeof creditLogId!=='string' || !creditLogId ||
    !['manualVoucher','existingOrder'].includes(basisType) || !notes || notes.length>1000 ||
    (basisType==='existingOrder' ? typeof orderId!=='string' || !orderId : orderId!==null))
    throw new ApiError('请选择原始批次、凭据类型并注明原始计价依据',400,'INVALID_PRICING');
  const amountCents=parseLessonAmount(input.amount);
  const requestId=parsed.data.toLowerCase(), organizationId=campus.organizationId;
  const payloadHash=createHash('sha256').update(JSON.stringify([studentId,creditLogId,basisType,orderId,amountCents,notes])).digest('hex');
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'lesson-pricing:'+organizationId}),hashtext(${requestId}))`;
    await scopedStudent(tx,studentId,campus);
    // Conversion correction and import also lock the order before the student.
    if (orderId) await tx.$queryRaw`SELECT id FROM conversions WHERE id=${orderId} AND "organizationId"=${organizationId} AND "studentId"=${studentId} FOR UPDATE`;
    await lockEnrollmentStudent(tx,studentId,campus);
    const student=await scopedStudent(tx,studentId,campus);
    const previous=await tx.lessonBatchPricing.findUnique({where:{organizationId_requestId:{organizationId,requestId}}});
    if (previous) {
      if (previous.actorId!==actor.id || previous.campusId!==campus.campusId || previous.studentId!==studentId)
        throw new ApiError('请求编号不在当前账号范围',403,'FORBIDDEN');
      if (previous.payloadHash!==payloadHash) throw new ApiError('同一请求编号的内容已变更',409,'IDEMPOTENCY_CONFLICT');
      return response(previous);
    }
    const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM lesson_logs WHERE id=${creditLogId} AND "studentId"=${studentId}
      AND "organizationId"=${organizationId} FOR UPDATE`;
    if (!locked.length) throw new ApiError('无法找到该学员的原入账流水',409,'BATCH_NOT_ELIGIBLE');
    const existing=await tx.lessonBatchPricing.findUnique({where:{creditLogId}});
    if (existing) {
      if (existing.studentId===studentId && existing.organizationId===organizationId)
        throw new ApiError('该批次已定价，请核对原记录',409,'BATCH_ALREADY_PRICED');
      throw new ApiError('该批次有无法核对的既有凭证，请核对原始记录',409,'BATCH_NOT_ELIGIBLE');
    }
    const summary=await state(tx,student,campus);
    const batch=summary.batches.find(b=>b.creditLogId===creditLogId);
    if (batch?.pricingStatus==='priced') throw new ApiError('该批次已定价，请核对原记录',409,'BATCH_ALREADY_PRICED');
    if (!batch?.canPrice) throw new ApiError(batch?.reason || '请选择能够核对的原始入账批次',409,'BATCH_NOT_ELIGIBLE');
    if (orderId && !batch.orderCandidates.some(o=>o.orderId===orderId && new Prisma.Decimal(o.amount).times(100).equals(amountCents)))
      throw new ApiError('订单不符合本批次的学员、课时、金额或已用于其他批次',409,'PRICING_ORDER_MISMATCH');
    const record=await tx.lessonBatchPricing.create({data:{organizationId,campusId:campus.campusId,studentId,creditLogId,
      originalLessons:batch.originalLessons,amountCents,basisType,orderId,notes,actorId:actor.id,requestId,payloadHash}});
    const checked=(await readLessonLedgers(tx,[student],organizationId)).get(studentId)!;
    if (checked.reconciliationRequired || checked.creditDetail(creditLogId)?.cents!==amountCents)
      throw new ApiError('原始流水存在无法唯一计价的冲回或分配，未确认补价',409,'BATCH_NOT_ELIGIBLE');
    return response(record);
  },{timeout:20000});
}
