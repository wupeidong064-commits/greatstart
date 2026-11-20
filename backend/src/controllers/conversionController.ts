import { readStudentLedger } from '../services/lessonLedger';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import { applyLinkedStudentChanges, orderProfileChanges } from '../services/studentOrderProfile';
import { orderRegistrationSchedules, registerOrder } from '../services/orderRegistrationService';
import { registrationActor } from '../services/registrationRequestService';
import { studentAccess } from '../utils/studentAccess';
import { businessDate } from '../services/scheduleAttendanceService';
import { Prisma } from '@prisma/client';
import { lockEnrollmentStudent } from '../services/enrollmentPeriod';
import { renewStudentIdempotently } from '../services/renewalService';
import { conversionVoidSummary } from '../services/conversionVoidSummary';

function conversionQuery(req: AuthRequest): Prisma.ConversionWhereInput {
  const u = req.user;
  if (!u?.organizationId) throw new ApiError('未分配机构', 403, 'FORBIDDEN');
  if (!u.campusId) throw new ApiError('账号尚未分配校区，请联系管理员', 403, 'CAMPUS_REQUIRED');
  const where: Prisma.ConversionWhereInput = { organizationId: u.organizationId };
  // Staff can only access orders for which they are the responsible salesperson.
  if (!['admin', 'manager'].includes(u.role || '')) {
    if (!u.id) throw new ApiError('未认证', 401, 'UNAUTHORIZED');
    where.salesId = u.id;
  }
  const and: Prisma.ConversionWhereInput[] = [];
  if (u.campusId) and.push({ OR: [
    { class: { organizationId: u.organizationId, campusId: u.campusId } },
    { classId: null, student: { organizationId: u.organizationId, campusId: u.campusId } },
    // Legacy orders awaiting student import have no student relation yet. Their
    // responsible salesperson is the campus authority used by student import.
    { classId: null, studentId: null, sales: { organizationId: u.organizationId, campusId: u.campusId } },
  ] });
  if (req.query.startDate || req.query.endDate) {
    const start = String(req.query.startDate || '');
    const end = String(req.query.endDate || '');
    if ((start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) || (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) || (start && end && start > end)) throw new ApiError('日期范围无效', 400, 'INVALID_DATE');
    where.conversionDate = { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
  }
  if (req.query.newOnly === 'true') and.push({ OR: [{ courseType: null }, { courseType: { notIn: ['renewal','续费','续报'] } }] });
  if (and.length) where.AND = and;
  return where;
}

async function lockConversion(tx: Prisma.TransactionClient, req: AuthRequest, id: string) {
  const scope = conversionQuery(req);
  await tx.$queryRaw`SELECT id FROM conversions WHERE id = ${id} AND "organizationId" = ${req.user!.organizationId} FOR UPDATE`;
  const order = await tx.conversion.findFirst({ where: { id, ...scope } });
  if (!order) throw new ApiError('成单信息不存在', 404, 'CONVERSION_NOT_FOUND');
  return order;
}

// Pagination must not affect the filters used for either rows or totals.
function conversionListQuery(req: AuthRequest): Prisma.ConversionWhereInput {
  const and: Prisma.ConversionWhereInput[] = [conversionQuery(req)];
  if (typeof req.query.studentId === 'string' && req.query.studentId) and.push({ studentId: req.query.studentId });
  if (typeof req.query.salesId === 'string' && req.query.salesId) and.push({ salesId: req.query.salesId });
  if (req.query.unlinkedOnly === 'true') and.push({ studentId: null, approvalStatus: { not: 'voided' } }); // 2026-11-08：待导入列表不显示作废单
  return { AND: and };
}

export const conversionController = {
  // 获取成单信息列表
  getConversions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(1000, Math.max(1, parseInt(req.query.pageSize as string) || 10));

      const currentUser = req.user;
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const where = conversionListQuery(req);

      const [conversions, count] = await Promise.all([
        prisma.conversion.findMany({
          where,
          // Same-day orders must keep a unique order across offset pages.
          orderBy: [{ conversionDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.conversion.count({ where }),
      ]);

      sendPaginated(res, conversions, page, pageSize, count);
    } catch (error) {
      next(error);
    }
  },

  getConversionSummary: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 2026-11-08：作废（红冲）单不算数——汇总只统计已确认成单
      const totals = await prisma.conversion.aggregate({ where: { ...conversionListQuery(req), approvalStatus: 'confirmed' }, _sum: { price: true }, _count: { _all: true, price: true } });
      sendSuccess(res, { amount: Number(totals._sum.price || 0), count: totals._count._all, pricedCount: totals._count.price });
    } catch (error) { next(error); }
  },

  getVoidedConversions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const integer = (value: unknown, fallback: number, maximum: number) => {
        if (value === undefined) return fallback;
        const text = String(value);
        const n = Number(text);
        if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(n) || n > maximum) throw new ApiError('分页参数无效', 400, 'INVALID_PAGINATION');
        return n;
      };
      const page = integer(req.query.page, 1, 1000000), pageSize = integer(req.query.pageSize, 8, 100);
      const where: Prisma.ConversionWhereInput = { AND: [conversionListQuery(req), { approvalStatus: 'voided' }] };
      const filters = {
        studentId: typeof req.query.studentId === 'string' ? req.query.studentId : undefined,
        salesId: typeof req.query.salesId === 'string' ? req.query.salesId : undefined,
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        unlinkedOnly: req.query.unlinkedOnly === 'true',
        newOnly: req.query.newOnly === 'true',
      };
      const result = await prisma.$transaction(async tx => {
        const [data, total, reversed] = await Promise.all([
          tx.conversion.findMany({ where, orderBy: [{ conversionDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
          tx.conversion.aggregate({ where, _sum: { price: true }, _count: { _all: true, price: true } }),
          conversionVoidSummary(tx, req.user!, filters),
        ]);
        return { data, pagination: { page, pageSize, total: total._count._all, totalPages: Math.ceil(total._count._all / pageSize) },
          summary: { count: total._count._all, amount: Number(total._sum.price || 0), pricedCount: total._count.price, ...reversed } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
      sendSuccess(res, result);
    } catch (error) { next(error); }
  },

  // 获取单条成单信息
  getConversionById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const conversion = await prisma.conversion.findFirst({ where: { id, ...conversionQuery(req) } });

      if (!conversion) {
        return next(new ApiError('成单信息不存在', 404, 'CONVERSION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && conversion.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, conversion);
    } catch (error) {
      next(error);
    }
  },

  // 更新成单信息（主要是关联学员）
  updateConversion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updateFields = req.body;
      registrationActor(req);
      const updated = await prisma.$transaction(async tx => {
        const existing = await lockConversion(tx, req, id);
        if (existing.approvalStatus === 'voided') throw new ApiError('作废记录需保留，不能编辑', 409, 'CONVERSION_VOIDED');

        if (existing.studentId || existing.experienceLessonId) {
          for (const field of ['studentId', 'classId', 'totalLessons'] as const) {
            if (updateFields[field] !== undefined && String(updateFields[field]) !== String(existing[field]))
              throw new ApiError('成单已入账，学员、班级或课时请通过正式变更流程处理', 409, 'USE_BUSINESS_CORRECTION');
          }
        }
        for (const field of ['classId','studentId','salesId','courseType','totalLessons','price','paymentMethod','paymentStatus','conversionDate'] as const) {
          if (updateFields[field] !== undefined && String(updateFields[field] ?? '') !== String(existing[field] ?? ''))
            throw new ApiError('成单关系或金额请通过对应业务办理', 409, 'USE_BUSINESS_CORRECTION');
        }
        const changes = orderProfileChanges(existing, updateFields);
        await applyLinkedStudentChanges(tx, req, existing, changes);
        if (!Object.keys(changes).length) return existing;
        return tx.conversion.update({ where: { id }, data: changes });
      });
      sendSuccess(res, updated, '成单信息更新成功');
    } catch (error) {
      next(error);
    }
  },

  getRegistrationSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, await orderRegistrationSchedules(registrationActor(req)));
    } catch (error) { next(error); }
  },

  createConversion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await registerOrder(req);
      res.set('Idempotency-Status', result.status);
      sendSuccess(res, result.data, '成单创建成功', result.status === 'replayed' ? 200 : 201);
    } catch (error) { next(error); }
  },

  renewStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await renewStudentIdempotently(req);
      sendSuccess(res, result, '续费成功', 201);
    } catch (error) { next(error); }
  },

  // 删除成单记录
  deleteConversion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      // 获取原成单记录
      const existing = await prisma.conversion.findFirst({ where: { id, ...conversionQuery(req) } });

      if (!existing) {
        return next(new ApiError('成单信息不存在', 404, 'CONVERSION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除', 403, 'FORBIDDEN'));
      }

      if (existing.studentId || existing.experienceLessonId) throw new ApiError('成单已关联学员或体验课，请通过更正流程处理并保留记录', 409, 'LINKED_CONVERSION');
      const removed = await prisma.conversion.deleteMany({ where: {
        id, studentId: null, experienceLessonId: null, approvalStatus: { not: 'voided' },
      } });
      if (!removed.count) throw new ApiError('作废或已关联记录需保留，不能删除', 409, 'CONVERSION_CHANGED');

      sendSuccess(res, null, '成单删除成功');
    } catch (error) {
      next(error);
    }
  },

  // 2026-11-08 用户拍板：成单作废（红冲）——错误成单不删除、保留全部记录。
  // 作废后单子退出所有 confirmed 口径（现金流/课消/退费计价/家长端缴费自动消失），
  // 已入账课时反向冲回并生成冲账流水（type='void'），作废原因与操作人追加写入原单 notes。
  voidConversion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      if (!['admin', 'manager'].includes(actor.role || '')) throw new ApiError('仅管理员或经理可作废成单', 403, 'FORBIDDEN');
      const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason || reason.length > 200) throw new ApiError('请填写作废原因（最多200字）', 400, 'INVALID_VOID_REASON');
      const result = await prisma.$transaction(async tx => {
        // Imports also lock the order first. Re-read its final state and current student after the lock.
        const existing = await lockConversion(tx, req, req.params.id);
        if (existing.approvalStatus === 'voided') return { conversion: existing, reversedLessons: 0, clamped: false, autoArchived: false, replayed: true };
        // 2026-11-08：confirmed 与历史遗留 pending 单均可作废（rejected 终态单无需红冲）
        if (!['confirmed', 'pending'].includes(existing.approvalStatus)) throw new ApiError('该成单状态不可作废', 409, 'NOT_VOIDABLE');
        const operator = await tx.user.findFirst({ where: { id: actor.id, organizationId: existing.organizationId }, select: { name: true } });
        const operatorName = operator?.name || actor.id;
        let reversedLessons = 0, clamped = false, autoArchived = false;
        let evidenceNote = '';
        if (existing.studentId) {
          const faceLessons = existing.totalLessons ?? 0;
          const scope = { organizationId: existing.organizationId, campusId: actor.campusId! };
          await lockEnrollmentStudent(tx, existing.studentId, scope);
          const student = await tx.student.findUniqueOrThrow({ where: { id: existing.studentId } });
          const credits = await tx.lessonLog.findMany({ where: {
            organizationId: existing.organizationId, studentId: student.id, type: 'add',
            OR: [
              { conversionId: existing.id },
              { batchPricing:{is:{organizationId:scope.organizationId,studentId:student.id,orderId:existing.id,
                basisType:'existingOrder',originalLessons:faceLessons}} },
              // Earlier new-sale/renewal writers set the business date and full order ID.
              // Manual additions and unrelated initial balances have no such receipt.
              ...(faceLessons > 0 ? [{ conversionId: null, businessDate: existing.conversionDate, scheduleId: null,
                lessons: faceLessons, notes: { in: ['新签入账：' + existing.id, '续费入账：' + existing.id] } }] : []),
            ],
          }, take: 2 });
          const credit = credits.length === 1 ? credits[0] : null;
          // Renewal receipts were already committed atomically with order and balance before
          // structured log links existed. Accept only an exact scoped order/amount match.
          const renewal = !credits.length && faceLessons > 0 && await tx.renewalRequest.findFirst({ where: {
            organizationId: existing.organizationId, studentId: student.id,
            AND: [{ response: { path: ['conversion', 'id'], equals: existing.id } },
              { response: { path: ['conversion', 'totalLessons'], equals: faceLessons } }],
          } });
          const posted = credit ? credit.lessons : renewal ? faceLessons : 0;
          const reversed = posted > 0 && await tx.lessonLog.findFirst({ where: {
            organizationId: existing.organizationId, studentId: student.id, type: 'void',
            OR: [{ conversionId: existing.id }, ...(credit ? [{ reversalOfId: credit.id }] : []),
              { notes: { startsWith: '成单作废冲回 ' + existing.id.slice(0, 8) + '：' } }],
          } });
          if (posted <= 0 || reversed) {
            evidenceNote = reversed ? '已有冲回记录，本次未扣课' : '缺少唯一可核对的原单入账流水，本次未扣课';
          } else {
            const ledger = await readStudentLedger(tx,student,existing.organizationId);
            const lotId = credit?.id ?? (renewal ? 'renewal:'+existing.id : undefined);
            const sourceRemaining = ledger.availableIn(lotId);
            const alreadyRefunded = lotId ? ledger.outstandingRefundsIn(lotId) : 0;
            const back = Math.max(0, Math.min(student.remainingLessons,posted,sourceRemaining ?? 0));
            if (sourceRemaining === null) evidenceNote = '原单剩余批次不可核，本次未冲回学员可用余额';
            const allocations = ledger.take(back,'any',lotId);
            const purchasedReduction = Math.max(0,Math.min(student.purchasedLessons,sourceRemaining===null ? 0 : posted-alreadyRefunded));
            reversedLessons = back;
            clamped = back < posted;
            await tx.student.update({ where: { id: student.id }, data: {
              purchasedLessons: { decrement: purchasedReduction },
              remainingLessons: { decrement: back },
            } });
            await tx.lessonLog.create({ data: {
              organizationId: existing.organizationId, studentId: student.id, studentName: student.name,
              type: 'void', purchasedReduction, allocations, lessons: back, conversionId: existing.id, reversalOfId: credit?.id,
              notes: `成单作废冲回 ${existing.id}：${reason}`,
              operatorId: actor.id, operatorName,
            } });
            // 2026-11-08 用户拍板：作废后学员若已无任何课时与在读班级（该单生成的空壳），自动归档移出学员管理
            const after = await tx.student.findUniqueOrThrow({ where: { id: student.id } });
            const activeEnrollments = await tx.enrollment.count({ where: { studentId: student.id, organizationId: existing.organizationId, status: 'active' } });
            if (after.status === 'active' && after.purchasedLessons === 0 && after.remainingLessons === 0 && activeEnrollments === 0) {
              await tx.student.update({ where: { id: student.id }, data: {
                status: 'archived', archivedAt: new Date(), archiveReason: 'other',
                archiveNote: `成单作废自动归档（单号 ${existing.id.slice(0, 8)}）`, archivePreviousStatus: 'active',
              } });
              autoArchived = true;
            }
          }
        }
        if (!existing.studentId && (existing.totalLessons || 0) > 0) evidenceNote = '原单未关联学员，本次未扣课';
        const voidNote = `【作废 ${businessDate(new Date())}】${reason}（操作人：${operatorName}）${evidenceNote ? "；" + evidenceNote : ""}`;
        const conversion = await tx.conversion.update({ where: { id: existing.id }, data: {
          approvalStatus: 'voided',
          notes: [existing.notes, voidNote].filter(Boolean).join('；'),
        } });
        return { conversion, reversedLessons, clamped, autoArchived, evidenceNote, replayed: false };
      }, { maxWait: 10000, timeout: 20000 });
      sendSuccess(res, result, result.replayed
        ? '该成单此前已作废'
        : `成单已作废${result.reversedLessons ? `，冲回课时 ${result.reversedLessons} 节` : ''}${result.clamped ? '（部分课时已被消耗，仅冲回剩余部分）' : ''}${result.evidenceNote ? '；' + result.evidenceNote : ''}${result.autoArchived ? '；学员已无课时与在读班级，自动归档（可在已归档学员恢复）' : ''}；记录已保留可追溯`);
    } catch (error) {
      next(error);
    }
  },

  // 关联学员到成单信息
  linkStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { conversionId, studentId } = req.body;
      if (typeof conversionId !== 'string' || !conversionId || typeof studentId !== 'string' || !studentId)
        throw new ApiError('缺少参数', 400, 'MISSING_PARAMS');
      const access = studentAccess(req);
      const updated = await prisma.$transaction(async tx => {
        const order = await lockConversion(tx, req, conversionId);
        if (order.approvalStatus === 'voided') throw new ApiError('作废记录不能关联学员', 409, 'CONVERSION_VOIDED');
        await lockEnrollmentStudent(tx, studentId, access.campus);
        const student = await tx.student.findFirst({ where: { id: studentId, ...access.where }, select: { id: true } });
        if (!student) throw new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND');
        if (order.studentId === student.id) return order;
        if (order.studentId) throw new ApiError('成单已关联学员，请通过更正流程处理', 409, 'ALREADY_LINKED');
        return tx.conversion.update({ where: { id: conversionId }, data: { studentId: student.id } });
      });
      sendSuccess(res, updated, '学员关联成功');
    } catch (error) {
      next(error);
    }
  },
};
