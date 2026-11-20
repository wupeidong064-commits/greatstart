"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundRoutes = void 0;
const lessonLedger_1 = require("../services/lessonLedger");
const refundQuote_1 = require("../services/refundQuote");
const refundRestore_1 = require("../services/refundRestore");
const enrollmentPeriod_1 = require("../services/enrollmentPeriod");
const studentAccess_1 = require("../utils/studentAccess");
const crypto_1 = require("crypto");
const express_1 = require("express");
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const scope_1 = require("../utils/scope");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const studentResponsibility_1 = require("../services/studentResponsibility");
const managementAccess_1 = require("../services/managementAccess");
async function debitQuotedRefund(tx, studentId, organizationId, refundId, lessons, amount, operatorId, notes) {
    const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
    (0, refundQuote_1.requireFullRefund)(student.remainingLessons, lessons);
    const quote = await (0, refundQuote_1.quoteRefund)(tx, student, lessons);
    (0, refundQuote_1.validateRefundQuote)(quote, amount);
    if (lessons)
        await tx.lessonLog.create({ data: { organizationId, studentId, studentName: student.name, type: 'refund', refundId,
                allocations: quote.allocations, lessons, notes, operatorId } });
}
async function reverseRefundDebit(tx, refund, operatorId) {
    if (!refund.lessonsToRefund)
        return;
    const { id, studentId, organizationId, lessonsToRefund } = refund;
    const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
    const ledger = await (0, lessonLedger_1.readStudentLedger)(tx, student, organizationId);
    const oldNotes = ['退费审批 ' + id];
    // Older confirmations recorded only the first eight UUID characters. Require
    // an unambiguous refund in this student's history before linking that debit.
    const samePrefix = await tx.refund.count({ where: { organizationId, studentId, id: { startsWith: id.slice(0, 8), mode: 'insensitive' } } });
    if (samePrefix === 1)
        oldNotes.push('退费确认 ' + id.slice(0, 8));
    const originals = await tx.lessonLog.findMany({ where: { organizationId, studentId, type: 'refund', lessons: lessonsToRefund,
            OR: [{ refundId: id }, { refundId: null, notes: { in: oldNotes } }] }, take: 2 });
    const original = originals.length === 1 ? originals[0] : undefined;
    const value = original && ledger.reverse(original.id);
    // An untraceable legacy refund restores the contractual quantity into
    // unknown-price inventory without assigning it to a current purchase.
    await tx.lessonLog.create({ data: { organizationId, studentId, studentName: student.name, type: 'add', lessons: lessonsToRefund,
            lessonSource: value?.lessonSource ?? 'paid', reversalOfId: original?.id, allocations: value?.allocations, refundId: id,
            notes: '退费取消返还 ' + id.slice(0, 8) + (original ? '' : '（原扣课批次待核）'), operatorId } });
}
exports.refundRoutes = (0, express_1.Router)();
exports.refundRoutes.use(auth_1.authenticate, (0, rbac_1.requireOrganizationAccess)(), (0, rbac_1.requireMinRole)('staff'));
const scoped = (req) => {
    const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
    if (['teacher', 'coach'].includes(req.user?.role || '')) {
        const access = (0, studentResponsibility_1.renewalAccess)(req);
        // A teacher retains their own refund history after refunding ends all
        // teaching responsibility. Current membership alone cannot retain it.
        return { organizationId, student: access.campus, AND: [{ OR: [{ submittedById: access.actor.id }, { student: access.where }] }] };
    }
    return { organizationId, ...(campusId ? { student: (0, studentAccess_1.studentAccess)(req).where } : {}) };
};
exports.refundRoutes.get('/quote', (0, rbac_1.requireRole)('admin', 'manager', 'coach'), async (req, res, next) => {
    try {
        const { studentId, lessonsToRefund } = req.query;
        if (typeof studentId !== 'string' || !studentId || (lessonsToRefund !== undefined &&
            (typeof lessonsToRefund !== 'string' || !/^\d+$/.test(lessonsToRefund) || !Number.isSafeInteger(Number(lessonsToRefund)))))
            throw new errorHandler_1.ApiError('学员或退回课时无效', 400, 'INVALID_REFUND');
        const result = await database_1.default.$transaction(async (tx) => {
            const student = await tx.student.findFirst({ where: { id: studentId, AND: [(0, studentResponsibility_1.renewalAccess)(req).where] } });
            if (!student)
                throw new errorHandler_1.ApiError('学员不存在或不属于当前校区', 404, 'STUDENT_NOT_FOUND');
            (0, refundQuote_1.requireFullRefund)(student.remainingLessons, lessonsToRefund === undefined ? student.remainingLessons : Number(lessonsToRefund));
            return (0, refundQuote_1.quoteRefund)(tx, student, lessonsToRefund === undefined ? student.remainingLessons : Number(lessonsToRefund));
        }, { isolationLevel: 'RepeatableRead', timeout: 20000 });
        (0, response_1.sendSuccess)(res, result);
    }
    catch (e) {
        next(e);
    }
});
exports.refundRoutes.get('/', async (req, res, next) => {
    try {
        const start = req.query.startDate ? (0, refundQuote_1.refundDay)(req.query.startDate, '开始日期') : undefined;
        const end = req.query.endDate ? (0, refundQuote_1.refundDay)(req.query.endDate, '结束日期', true) : undefined;
        if (start && end && start > end)
            throw new errorHandler_1.ApiError('日期顺序无效', 400, 'INVALID_DATE');
        const page = Number(req.query.page ?? 1), pageSize = Number(req.query.pageSize ?? 20);
        if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200 || (page - 1) * pageSize > 2147483647)
            throw new errorHandler_1.ApiError('分页参数无效', 400, 'INVALID_PAGINATION');
        const scope = { ...scoped(req), ...(typeof req.query.studentId === 'string' ? { studentId: req.query.studentId } : {}) };
        const range = { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
        const approved = { status: 'approved', ...(start || end ? { reviewedAt: range } : {}) };
        const cancelled = { status: 'cancelled', ...(start || end ? { updatedAt: range } : {}) };
        const where = { ...scope, OR: [approved, cancelled, { status: { notIn: ['approved', 'cancelled'] }, ...(start || end ? { createdAt: range } : {}) }] };
        const [total, rows, ap, ca] = await database_1.default.$transaction([
            database_1.default.refund.count({ where }),
            database_1.default.refund.findMany({ where, include: { payout: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
            database_1.default.refund.aggregate({ where: { ...scope, ...approved }, _count: { id: true }, _sum: { amountToRefund: true, lessonsToRefund: true } }),
            database_1.default.refund.aggregate({ where: { ...scope, ...cancelled }, _count: { id: true }, _sum: { amountToRefund: true } }),
        ], { isolationLevel: 'RepeatableRead' });
        (0, response_1.sendSuccess)(res, { data: rows, summary: { approvedCount: ap._count.id, approvedAmount: Number(ap._sum.amountToRefund ?? 0),
                approvedLessons: ap._sum.lessonsToRefund ?? 0, cancelledCount: ca._count.id, cancelledAmount: Number(ca._sum.amountToRefund ?? 0) },
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }, period: { start: start ?? null, end: end ?? null },
            caliber: '已通过按确认时间、已取消按取消时间统计，金额仅计已通过。' });
    }
    catch (e) {
        next(e);
    }
});
exports.refundRoutes.post('/', async (req, res, next) => {
    try {
        const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
        const { studentId, amountToRefund, lessonsToRefund, reason } = req.body;
        // The client supplies a UUID once for this application and reuses it after a network failure.
        const id = req.get('Idempotency-Key') || req.body.requestId;
        if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
            throw new errorHandler_1.ApiError('请提供退费请求UUID', 400, 'IDEMPOTENCY_KEY_REQUIRED');
        if (!Number.isSafeInteger(lessonsToRefund) || lessonsToRefund < 0 || typeof reason !== 'string' || !reason.trim() || reason.length > 2000 || !['number', 'string'].includes(typeof amountToRefund) || !/^\d+(\.\d{1,2})?$/.test(String(amountToRefund)))
            throw new errorHandler_1.ApiError('退费参数无效', 400, 'INVALID_REFUND');
        const amount = new client_1.Prisma.Decimal(amountToRefund);
        if ((amount.eq(0) && !lessonsToRefund) || amount.gt('99999999.99'))
            throw new errorHandler_1.ApiError('退费金额无效', 400, 'INVALID_REFUND');
        if (typeof studentId !== 'string' || !studentId)
            throw new errorHandler_1.ApiError('请选择学员', 400);
        const student = await database_1.default.student.findFirst({ where: { ...(0, studentAccess_1.studentAccess)(req).where, id: studentId } });
        if (!student)
            throw new errorHandler_1.ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND');
        const actor = req.user;
        const replay = async () => {
            const old = await database_1.default.refund.findUnique({ where: { id } });
            if (!old)
                return null;
            if (old.organizationId !== organizationId || old.studentId !== studentId || old.submittedById !== actor.id || !old.amountToRefund.eq(amount) || old.lessonsToRefund !== lessonsToRefund || old.reason !== reason.trim())
                throw new errorHandler_1.ApiError('请求编号冲突', 409, 'IDEMPOTENCY_CONFLICT');
            return old;
        };
        const old = await replay();
        if (old)
            return (0, response_1.sendSuccess)(res, old);
        (0, refundQuote_1.requireFullRefund)(student.remainingLessons, lessonsToRefund);
        let refund;
        try {
            refund = await database_1.default.refund.create({ data: { id, organizationId, studentId, studentName: student.name, amountToRefund: amount, lessonsToRefund, reason: reason.trim(), submittedById: actor.id } });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                const old = await replay();
                if (old)
                    return (0, response_1.sendSuccess)(res, old);
            }
            throw e;
        }
        (0, response_1.sendSuccess)(res, refund, '退费申请已提交', 201);
    }
    catch (e) {
        next(e);
    }
});
exports.refundRoutes.post('/:id/review', (0, rbac_1.requireRole)('admin', 'manager'), async (req, res, next) => {
    try {
        const { status, rejectReason } = req.body;
        if (!['approved', 'rejected'].includes(status) || (status === 'rejected' && (typeof rejectReason !== 'string' || !rejectReason.trim())))
            throw new errorHandler_1.ApiError('审批参数无效', 400, 'INVALID_REVIEW');
        const result = await database_1.default.$transaction(async (tx) => {
            const refund = await tx.refund.findFirst({ where: { id: req.params.id, ...scoped(req) } });
            if (!refund)
                throw new errorHandler_1.ApiError('退费申请不存在', 404, 'REFUND_NOT_FOUND');
            // Serialize approvals for one student's cash cap, including distinct applications.
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${refund.organizationId + '::refund::' + refund.studentId}))`;
            await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, refund.studentId, (0, studentAccess_1.studentAccess)(req).campus);
            const current = await tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
            if (current.status === status)
                return current;
            if (current.status !== 'pending')
                throw new errorHandler_1.ApiError('申请已审批', 409, 'REFUND_ALREADY_REVIEWED');
            const actor = req.user;
            if (refund.submittedById === actor.id)
                throw new errorHandler_1.ApiError('不能审批本人申请', 403, 'SELF_REVIEW_FORBIDDEN');
            if (status === 'approved') {
                await debitQuotedRefund(tx, refund.studentId, refund.organizationId, refund.id, refund.lessonsToRefund, refund.amountToRefund, actor.id, '退费审批 ' + refund.id);
                const updated = await tx.student.updateMany({ where: { id: refund.studentId, organizationId: refund.organizationId, remainingLessons: { gte: refund.lessonsToRefund }, purchasedLessons: { gte: refund.lessonsToRefund }, frozenLessons: 0 }, data: { remainingLessons: { decrement: refund.lessonsToRefund }, purchasedLessons: { decrement: refund.lessonsToRefund } } });
                if (updated.count !== 1)
                    throw new errorHandler_1.ApiError('课时不足或存在冻结课时', 409, 'INSUFFICIENT_LESSONS');
            }
            return tx.refund.update({ where: { id: refund.id }, data: { status, reviewedById: actor.id, reviewedAt: new Date(), rejectReason: status === 'rejected' ? rejectReason.trim() : null } });
        });
        (0, response_1.sendSuccess)(res, result, '退费审批已记录');
    }
    catch (e) {
        next(e);
    }
});
// 2026-11-08 用户拍板：退费依靠线下流程，账内简化为「确认即通过」——不再走申请-审批链。
// 确认即扣减课时、结束在读报名（退班）并标记学员退费；误操作用 /cancel 整体回滚。
exports.refundRoutes.post('/confirm', (0, rbac_1.requireRole)('admin', 'manager', 'coach'), async (req, res, next) => {
    try {
        const { organizationId } = (0, scope_1.resolveScope)(req);
        const { studentId, amountToRefund, lessonsToRefund, reason, refundDate } = req.body;
        const id = req.get('Idempotency-Key') || req.body.requestId;
        if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
            throw new errorHandler_1.ApiError('请提供退费请求UUID', 400, 'IDEMPOTENCY_KEY_REQUIRED');
        if (!Number.isSafeInteger(lessonsToRefund) || lessonsToRefund < 0 || typeof reason !== 'string' || !reason.trim() || reason.length > 2000 || !['number', 'string'].includes(typeof amountToRefund) || !/^\d+(\.\d{1,2})?$/.test(String(amountToRefund)))
            throw new errorHandler_1.ApiError('退费参数无效', 400, 'INVALID_REFUND');
        const amount = new client_1.Prisma.Decimal(amountToRefund);
        if ((amount.eq(0) && !lessonsToRefund) || amount.gt('99999999.99'))
            throw new errorHandler_1.ApiError('退费金额无效', 400, 'INVALID_REFUND');
        if (typeof studentId !== 'string' || !studentId)
            throw new errorHandler_1.ApiError('请选择学员', 400);
        const { campus } = (0, studentResponsibility_1.renewalAccess)(req);
        const actor = req.user;
        const requestId = id.toLowerCase();
        const payloadHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify([
            'v2', studentId, amount.toFixed(2), lessonsToRefund, reason.trim(), refundDate ?? null,
        ])).digest('hex');
        const result = await database_1.default.$transaction(async (tx) => {
            await (0, managementAccess_1.lockManagement)(tx, organizationId);
            const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
            if (!currentActor?.isActive || currentActor.organizationId !== organizationId || currentActor.campusId !== campus.campusId || (0, managementAccess_1.effectiveRole)(currentActor) !== actor.role || currentActor.isPlatformAdmin !== !!actor.isPlatformAdmin)
                throw new errorHandler_1.ApiError('账号权限已变化，请刷新后重试', 403, 'FORBIDDEN');
            // Refund IDs are global. Serialize the key even when competing requests target different students.
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('refund-confirm'), hashtext(${requestId}))`;
            const receipt = await tx.refundConfirmReceipt.findUnique({ where: { requestId } });
            if (receipt) {
                if (receipt.organizationId !== organizationId || receipt.campusId !== campus.campusId || receipt.actorId !== actor.id)
                    throw new errorHandler_1.ApiError('无权查看该退费请求', 403, 'FORBIDDEN');
                if (receipt.payloadHash !== payloadHash) {
                    // Earlier clients hashed the parsed instant and accepted ISO timestamps.
                    const legacyDate = refundDate ? new Date(refundDate) : null;
                    if (legacyDate && !Number.isFinite(+legacyDate))
                        throw new errorHandler_1.ApiError('请求编号冲突', 409, 'IDEMPOTENCY_CONFLICT');
                    const legacyHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify([
                        studentId, amount.toFixed(2), lessonsToRefund, reason.trim(), legacyDate?.toISOString() ?? null,
                    ])).digest('hex');
                    if (receipt.payloadHash !== legacyHash)
                        throw new errorHandler_1.ApiError('请求编号冲突', 409, 'IDEMPOTENCY_CONFLICT');
                }
                return receipt.response;
            }
            // Legacy confirmations did not retain the original date intent or response after cancellation.
            const old = await tx.refund.findFirst({ where: { id: { equals: requestId, mode: 'insensitive' } }, select: { id: true } });
            if (old)
                throw new errorHandler_1.ApiError('该请求编号已有退费记录，缺少可回放回执，请核对原记录', 409, 'IDEMPOTENCY_CONFLICT');
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${organizationId + '::refund::' + studentId}))`;
            await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, studentId, campus);
            // Recheck ownership after waiting for account, handover and student locks.
            // Only the actor's immutable receipt may replay without current ownership.
            const student = await tx.student.findFirst({ where: { id: studentId, AND: [(0, studentResponsibility_1.renewalAccess)(req).where] } });
            if (!student)
                throw new errorHandler_1.ApiError('学员不存在或已不由本人负责，请刷新后重试', 403, 'FORBIDDEN');
            if (student.status === 'refunded')
                throw new errorHandler_1.ApiError('该学员已是退费状态', 409, 'ALREADY_REFUNDED');
            // 原子完成：课时扣减 + 学员标记退费，条件不满足时整体回滚（记录不落库）
            const boundary = new Date();
            const paidAt = refundDate === undefined ? boundary : (0, refundQuote_1.refundDay)(refundDate, '退费日期');
            if (paidAt > boundary)
                throw new errorHandler_1.ApiError('退费日期晚于当前上海日期', 400, 'INVALID_DATE');
            const enrollments = await tx.enrollment.findMany({ where: { studentId, organizationId, status: 'active' }, include: { class: { select: { organizationId: true, campusId: true } } } });
            for (const row of enrollments) {
                if (row.class.organizationId !== organizationId || row.class.campusId !== campus.campusId)
                    throw new errorHandler_1.ApiError('在读报名不属于当前校区，请核对班级', 409, 'REFUND_ENROLLMENT_SCOPE');
                // 2026-11-15 用户拍板：退费与流失登记对齐——老师提前点名产生"未来场次已有考勤"时不再拦截退费，
                // 考勤事实保留、照常可更正；此处仅校验报名期与校区范围（与 removeAsLost 的豁免语义一致）。
                await (0, enrollmentPeriod_1.recordedAttendanceForRemoval)(tx, row, boundary);
            }
            await debitQuotedRefund(tx, studentId, organizationId, requestId, lessonsToRefund, amount, actor.id, '退费确认 ' + id.slice(0, 8));
            const updated = await tx.student.updateMany({
                where: { id: studentId, organizationId, status: { not: 'refunded' }, remainingLessons: { gte: lessonsToRefund }, purchasedLessons: { gte: lessonsToRefund }, frozenLessons: 0 },
                data: { remainingLessons: { decrement: lessonsToRefund }, purchasedLessons: { decrement: lessonsToRefund }, status: 'refunded', refundReason: reason.trim(), refundDate: paidAt },
            });
            if (updated.count !== 1)
                throw new errorHandler_1.ApiError('课时不足、存在冻结课时或学员已是退费状态', 409, 'REFUND_GUARD_FAILED');
            for (const e of enrollments)
                await tx.enrollment.update({ where: { id: e.id }, data: { status: 'completed', endedAt: boundary } });
            const operator = await tx.user.findFirst({ where: { id: actor.id, organizationId }, select: { name: true } });
            const operatorName = operator?.name || null;
            const refund = await tx.refund.create({ data: { id: requestId, organizationId, studentId, studentName: student.name, amountToRefund: amount, lessonsToRefund, reason: reason.trim(), status: 'approved', submittedById: actor.id, submittedByName: operatorName, reviewedById: actor.id, reviewedByName: operatorName, reviewedAt: boundary, notes: (0, refundRestore_1.refundSnapshot)(student, { status: 'refunded', refundDate: paidAt, refundReason: reason.trim() }, enrollments, boundary) } });
            const response = JSON.parse(JSON.stringify(refund));
            await tx.refundConfirmReceipt.create({ data: {
                    requestId, organizationId, campusId: campus.campusId, studentId, actorId: actor.id, payloadHash, response,
                } });
            return response;
        }, { timeout: 20000 });
        (0, response_1.sendSuccess)(res, result, '退费已确认：课时已扣减、在读报名已结束、学员已标记退费');
    }
    catch (e) {
        next(e);
    }
});
// All affected classes must be restorable before any part of the refund is reversed.
exports.refundRoutes.post('/:id/cancel', (0, rbac_1.requireRole)('admin', 'manager'), async (req, res, next) => {
    try {
        const { organizationId } = (0, scope_1.resolveScope)(req);
        const result = await database_1.default.$transaction(async (tx) => {
            const refund = await tx.refund.findFirst({ where: { id: req.params.id, ...scoped(req) } });
            if (!refund)
                throw new errorHandler_1.ApiError('退费记录不存在', 404, 'REFUND_NOT_FOUND');
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${organizationId + '::refund::' + refund.studentId}))`;
            await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, refund.studentId, (0, studentAccess_1.studentAccess)(req).campus);
            const current = await tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
            if (current.status === 'cancelled')
                return { refund: current, restoredClasses: [], skippedClasses: [] };
            if (current.status !== 'approved')
                throw new errorHandler_1.ApiError('仅已通过的退费可取消', 409, 'REFUND_NOT_APPROVED');
            const student = await tx.student.findUniqueOrThrow({ where: { id: refund.studentId } });
            const restore = await (0, refundRestore_1.prepareRefundRestore)(tx, current, student, (0, studentAccess_1.studentAccess)(req).campus);
            await reverseRefundDebit(tx, current, req.user.id);
            await tx.student.update({ where: { id: student.id }, data: { ...restore.studentFields,
                    remainingLessons: { increment: current.lessonsToRefund }, purchasedLessons: { increment: current.lessonsToRefund } } });
            for (const row of restore.enrollments)
                await tx.enrollment.update({ where: { id: row.id }, data: { status: 'active', endedAt: null } });
            const updated = await tx.refund.update({ where: { id: refund.id }, data: { status: 'cancelled', rejectReason: null } });
            return { refund: updated, restoredClasses: restore.enrollments.map(e => e.name), skippedClasses: [] };
        }, { timeout: 20000 });
        (0, response_1.sendSuccess)(res, result, '退费已取消');
    }
    catch (e) {
        next(e);
    }
});
// Register existing offline disbursement evidence; this endpoint never initiates a payment.
exports.refundRoutes.post('/:id/payout', (0, rbac_1.requireRole)('admin', 'manager'), async (req, res, next) => {
    try {
        const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
        const { amount, paymentMethod, proofReference, recipientName, paidAt } = req.body;
        const requestId = req.get('Idempotency-Key') || req.body.requestId;
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId))
            throw new errorHandler_1.ApiError('付款登记须提供请求编号', 400, 'IDEMPOTENCY_KEY_REQUIRED');
        if (!['number', 'string'].includes(typeof amount) || !/^\d+(\.\d{1,2})?$/.test(String(amount)) || new client_1.Prisma.Decimal(amount).lte(0) || new client_1.Prisma.Decimal(amount).gt('99999999.99'))
            throw new errorHandler_1.ApiError('付款金额无效', 400, 'INVALID_AMOUNT');
        if (!['cash', 'card', 'transfer', 'alipay', 'wechat'].includes(paymentMethod) || typeof proofReference !== 'string' || proofReference.trim().length < 4 || proofReference.length > 200 || typeof recipientName !== 'string' || !recipientName.trim() || recipientName.length > 100)
            throw new errorHandler_1.ApiError('付款方式、凭据编号及收款人不能为空', 400, 'INVALID_PAYOUT_PROOF');
        const date = typeof paidAt === 'string' ? new Date(paidAt) : new Date(NaN);
        if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000)
            throw new errorHandler_1.ApiError('付款时间无效或晚于当前时间', 400, 'INVALID_DATE');
        const value = new client_1.Prisma.Decimal(amount), proof = proofReference.trim(), recipient = recipientName.trim();
        const hash = (0, crypto_1.createHash)('sha256').update(JSON.stringify([req.params.id, value.toFixed(2), paymentMethod, proof, recipient, date.toISOString()])).digest('hex');
        const result = await database_1.default.$transaction(async (tx) => {
            const refund = await tx.refund.findFirst({ where: { id: req.params.id, ...scoped(req) }, include: { student: { select: { campusId: true } } } });
            if (!refund)
                throw new errorHandler_1.ApiError('退费申请不存在', 404, 'REFUND_NOT_FOUND');
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${organizationId + '::refund::' + refund.studentId}))`;
            const existing = await tx.refundPayout.findFirst({ where: { organizationId, OR: [{ requestId }, { refundId: refund.id }, { proofReference: proof }] } });
            if (existing) {
                if (existing.requestId === requestId && existing.requestHash === hash)
                    return existing;
                throw new errorHandler_1.ApiError('该申请已登记出款，或请求/凭据编号已被使用', 409, 'PAYOUT_ALREADY_RECORDED');
            }
            const current = await tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
            if (current.status !== 'approved')
                throw new errorHandler_1.ApiError('只能登记已批准申请的付款', 409, 'REFUND_NOT_APPROVED');
            if (!value.eq(current.amountToRefund))
                throw new errorHandler_1.ApiError('实付金额必须等于本次批准金额，不支持拆分登记', 409, 'PAYOUT_AMOUNT_MISMATCH');
            if (!current.reviewedAt || date < current.reviewedAt)
                throw new errorHandler_1.ApiError('付款日期不能早于审批通过日期', 400, 'PAYOUT_BEFORE_APPROVAL');
            const actor = req.user;
            const operator = await tx.user.findFirst({ where: { id: actor.id, organizationId }, select: { name: true } });
            if (!operator)
                throw new errorHandler_1.ApiError('登记人不属于该机构', 403, 'FORBIDDEN');
            return tx.refundPayout.create({ data: { organizationId, campusId: refund.student.campusId, studentId: refund.studentId, refundId: refund.id, requestId, requestHash: hash, amount: value, paymentMethod, proofReference: proof, recipientName: recipient, paidAt: date, recordedById: actor.id, recordedByName: operator.name } });
        });
        (0, response_1.sendSuccess)(res, result, '线下退款付款凭据已登记');
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            return next(new errorHandler_1.ApiError('付款凭据或申请已登记，请刷新核对', 409, 'PAYOUT_ALREADY_RECORDED'));
        next(e);
    }
});
//# sourceMappingURL=refunds.js.map