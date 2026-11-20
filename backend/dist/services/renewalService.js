"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renewStudentIdempotently = renewStudentIdempotently;
const lessonLedger_1 = require("./lessonLedger");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const registrationRequestService_1 = require("./registrationRequestService");
const orderRegistrationService_1 = require("./orderRegistrationService");
const studentResponsibility_1 = require("./studentResponsibility");
const studentProfileFields_1 = require("../utils/studentProfileFields");
const enrollmentPeriod_1 = require("./enrollmentPeriod");
const managementAccess_1 = require("./managementAccess");
/** Create the whole renewal atomically; replay a keyed request only after current authorization. */
async function renewStudentIdempotently(req) {
    (0, enrollmentPeriod_1.rejectClientEnrollmentPeriod)(req.body);
    const { actor, campus, management, where: accessWhere } = (0, studentResponsibility_1.renewalAccess)(req);
    const { existingStudentId, studentId, classId, totalLessons, price, paymentMethod, paymentStatus, salesId, conversionDate, notes, requestId } = req.body;
    const targetStudentId = existingStudentId || studentId;
    if (typeof targetStudentId !== 'string' || !targetStudentId || !Number.isSafeInteger(totalLessons) || totalLessons <= 0 || totalLessons > 2147483647)
        throw new errorHandler_1.ApiError('请选择学员并填写有效的续费课时', 400, 'INVALID_RENEWAL');
    // Every caller must retain one identifier until the outcome is confirmed.
    // Old tabs without it must fail before writing rather than create untracked credits.
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
        throw new errorHandler_1.ApiError('续费请求标识缺失或无效，请刷新页面后重试', 400, 'INVALID_REQUEST_ID');
    const key = requestId.toLowerCase();
    if (classId != null && (typeof classId !== 'string' || !classId))
        throw new errorHandler_1.ApiError('班级无效', 400, 'INVALID_CLASS');
    if (notes != null && (typeof notes !== 'string' || notes.length > 2000))
        throw new errorHandler_1.ApiError('备注无效', 400, 'INVALID_NOTES');
    if (salesId != null && (typeof salesId !== 'string' || !salesId))
        throw new errorHandler_1.ApiError('负责人无效', 400, 'INVALID_SALES');
    if (paymentMethod != null && typeof paymentMethod !== 'string')
        throw new errorHandler_1.ApiError('支付方式无效', 400, 'INVALID_PAYMENT');
    if (paymentStatus != null && !['paid', 'pending', 'partial', 'unpaid'].includes(paymentStatus))
        throw new errorHandler_1.ApiError('支付状态无效', 400, 'INVALID_PAYMENT');
    let amount = null;
    if (price != null) {
        const text = String(price).trim();
        if ((typeof price !== 'string' && typeof price !== 'number') || !/^\d{1,8}(?:\.\d{1,2})?$/.test(text))
            throw new errorHandler_1.ApiError('续费金额应为非负数，最多两位小数', 400, 'INVALID_PRICE');
        amount = new client_1.Prisma.Decimal(text);
    }
    if (!management && salesId && salesId !== actor.id)
        throw new errorHandler_1.ApiError('只能登记本人负责的续费', 403, 'FORBIDDEN');
    const finalSalesId = management ? (salesId || null) : actor.id;
    const dateStr = conversionDate || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
        throw new errorHandler_1.ApiError('续费日期无效', 400, 'INVALID_DATE');
    (0, studentProfileFields_1.validateBusinessDate)(dateStr, '续费日期');
    const normalizedNotes = typeof notes === 'string' ? notes.trim() : '';
    // The default business date belongs to the first committed operation, not
    // the request identity: a retry after midnight must match the same intent.
    // The sentinel cannot collide with a valid explicit YYYY-MM-DD date.
    const dateIntent = conversionDate ? dateStr : '__server_business_date__';
    const hash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({ version: 1, studentId: targetStudentId, classId: classId || null, totalLessons, price: amount?.toString() ?? null, paymentMethod: paymentMethod || null, paymentStatus: paymentStatus || 'pending', salesId: finalSalesId, conversionDate: dateIntent, notes: normalizedNotes })).digest('hex');
    return database_1.default.$transaction(async (tx) => {
        // Match handover/deactivation's management -> student order. A request that
        // waited through a revocation must not retain its pre-lock identity.
        await (0, managementAccess_1.lockManagement)(tx, campus.organizationId);
        const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
        if (!currentActor?.isActive || currentActor.organizationId !== campus.organizationId || currentActor.campusId !== campus.campusId ||
            (0, managementAccess_1.effectiveRole)(currentActor) !== actor.role || currentActor.isPlatformAdmin !== !!actor.isPlatformAdmin)
            throw new errorHandler_1.ApiError('账号权限已变化，请刷新后重新办理续费', 403, 'FORBIDDEN');
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${campus.organizationId}), hashtext(${key}))`;
        await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, targetStudentId, campus);
        const student = await tx.student.findFirst({ where: { id: targetStudentId, AND: [accessWhere] } });
        if (!student)
            throw new errorHandler_1.ApiError('学员不存在或无权办理续费', 403, 'FORBIDDEN');
        {
            const receipt = await tx.renewalRequest.findUnique({ where: { organizationId_requestId: { organizationId: campus.organizationId, requestId: key } } });
            if (receipt) {
                if (receipt.actorId !== actor.id || receipt.studentId !== targetStudentId)
                    throw new errorHandler_1.ApiError('无权查看该续费请求', 403, 'FORBIDDEN');
                if (receipt.payloadHash !== hash)
                    throw new errorHandler_1.ApiError('该续费请求已用于不同内容，请核对原记录', 409, 'IDEMPOTENCY_CONFLICT');
                const snapshot = receipt.response;
                const id = snapshot?.conversion?.id;
                const correction = () => new errorHandler_1.ApiError('原续费成单已作废、缺失或状态已变更，请核对原单', 409, 'USE_CONVERSION_CORRECTION');
                if (typeof id !== 'string' || !id)
                    throw correction();
                const order = await tx.conversion.findFirst({
                    where: { id, studentId: targetStudentId, ...(0, orderRegistrationService_1.orderAccess)((0, registrationRequestService_1.registrationActor)(req)) },
                    select: { approvalStatus: true },
                });
                if (!order) {
                    if (await tx.conversion.findFirst({ where: { id, organizationId: campus.organizationId }, select: { id: true } }))
                        throw new errorHandler_1.ApiError('无权查看该续费请求', 403, 'FORBIDDEN');
                    throw correction();
                }
                if (order.approvalStatus !== 'confirmed')
                    throw correction();
                return receipt.response;
            }
        }
        if (amount === null)
            throw new errorHandler_1.ApiError('续费须填写成交金额，零元请明确填写0', 400, 'INVALID_PRICE');
        // 2026-11-08 用户拍板：解除「当日已续费不能重复登记」限制——不排除极端情况当日多续；
        // 重试安全仍由上方 requestId 幂等回执保障（同一次提交的重复请求不会重复入账）。
        if (student.status === 'archived')
            throw new errorHandler_1.ApiError('学员已归档，请先恢复后再续费', 409, 'STUDENT_ARCHIVED');
        if (classId && student.status !== 'active')
            throw new errorHandler_1.ApiError('学员当前不可入班', 409, 'STUDENT_UNAVAILABLE');
        if (student.remainingLessons + totalLessons > 2147483647 || student.purchasedLessons + totalLessons > 2147483647)
            throw new errorHandler_1.ApiError('续费课时超出允许范围', 400, 'INVALID_RENEWAL');
        const seller = finalSalesId ? await tx.user.findFirst({ where: { id: finalSalesId, organizationId: campus.organizationId, campusId: campus.campusId, isActive: true, isPlatformAdmin: false, role: { in: ['sales', 'staff', 'teacher', 'coach', 'manager', 'admin'] } }, select: { id: true, name: true } }) : null;
        if (finalSalesId && !seller)
            throw new errorHandler_1.ApiError('续费负责人不可用', 400, 'INVALID_SALES');
        let selectedClass = null;
        if (classId) {
            selectedClass = await tx.class.findFirst({ where: { id: classId, ...campus, status: 'active' }, select: { id: true, name: true } });
            if (!selectedClass)
                throw new errorHandler_1.ApiError('班级不可用或不属于当前机构', 403, 'FORBIDDEN');
            const activeClasses = await tx.enrollment.findMany({ where: { organizationId: campus.organizationId, studentId: targetStudentId, status: 'active', endedAt: null, class: campus }, select: { classId: true } });
            const alreadyInTarget = activeClasses.some(e => e.classId === classId);
            if (!management && !alreadyInTarget)
                throw new errorHandler_1.ApiError('员工不能通过续费调整班级，请联系管理员', 403, 'FORBIDDEN');
            if (!alreadyInTarget && activeClasses.length > 1)
                throw new errorHandler_1.ApiError('该学员有多个在读班级，请先通过班级调整明确处理原班', 409, 'MULTIPLE_CLASSES');
            await (0, enrollmentPeriod_1.enrollForConversion)(tx, targetStudentId, classId, campus, true, actor.id);
        }
        const conversion = await tx.conversion.create({ data: {
                organizationId: campus.organizationId, studentId: targetStudentId, studentName: student.name,
                contact: student.phone || student.parentPhone || '', parentName: student.parentName,
                classId: selectedClass?.id || null, className: selectedClass?.name || null, courseType: 'renewal',
                totalLessons, price: amount, paymentMethod: paymentMethod || null, paymentStatus: paymentStatus || 'pending',
                salesId: seller?.id || null, salesName: seller?.name || null, conversionDate: dateStr,
                notes: normalizedNotes || '续费', approvalStatus: 'confirmed',
            } });
        const updated = await tx.student.update({ where: { id: targetStudentId }, data: {
                purchasedLessons: { increment: totalLessons }, remainingLessons: { increment: totalLessons },
                renewalStatus: null, noRenewalReason: null, noRenewalDate: null,
            }, select: { purchasedLessons: true, remainingLessons: true } });
        await tx.lessonLog.create({ data: { organizationId: campus.organizationId, studentId: targetStudentId, studentName: student.name, type: 'add', lessonSource: 'paid', creditAmountCents: (0, lessonLedger_1.creditCents)(amount, totalLessons, totalLessons), lessons: totalLessons, businessDate: dateStr, conversionId: conversion.id, notes: '续费入账：' + conversion.id, operatorId: actor.id, operatorName: actor.email } });
        const response = JSON.parse(JSON.stringify({ conversion, purchased: updated.purchasedLessons, remaining: updated.remainingLessons }));
        await tx.renewalRequest.create({ data: { organizationId: campus.organizationId, requestId: key, studentId: targetStudentId, actorId: actor.id, payloadHash: hash, response } });
        return response;
    }, { timeout: 20000 });
}
//# sourceMappingURL=renewalService.js.map