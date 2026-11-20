"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollmentController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const database_1 = __importDefault(require("../config/database"));
const studentAccess_1 = require("../utils/studentAccess");
const scope_1 = require("../utils/scope");
const enrollmentTransfer_1 = require("../services/enrollmentTransfer");
const enrollmentPeriod_1 = require("../services/enrollmentPeriod");
const studentResponsibility_1 = require("../services/studentResponsibility");
const managementAccess_1 = require("../services/managementAccess");
const scopedEnrollmentWhere = (req, id, includeRecall = false) => {
    const access = (0, studentAccess_1.studentAccess)(req, { includeRecall });
    return { id, organizationId: access.campus.organizationId, class: access.campus, student: access.where };
};
async function lockScopedEnrollment(tx, req, id, allowRemovalReplay = false) {
    const where = scopedEnrollmentWhere(req, id, allowRemovalReplay);
    const candidate = await tx.enrollment.findFirst({ where });
    if (!candidate)
        throw new errorHandler_1.ApiError('报名记录不存在或无权访问', 404, 'ENROLLMENT_NOT_FOUND');
    await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, candidate.studentId, (0, studentAccess_1.studentAccess)(req).campus);
    await (0, enrollmentPeriod_1.lockEnrollmentClass)(tx, candidate.classId, (0, studentAccess_1.studentAccess)(req).campus);
    // The enrollment row lock also serializes payment foreign-key references with deletion.
    await tx.$queryRaw `SELECT id FROM enrollments WHERE id = ${id} FOR UPDATE`;
    // Repeat both record and permission lookup after waiting for concurrent writers.
    const enrollment = await tx.enrollment.findFirst({ where: scopedEnrollmentWhere(req, id, allowRemovalReplay) });
    if (!enrollment)
        throw new errorHandler_1.ApiError('报名记录不存在或无权访问', 404, 'ENROLLMENT_NOT_FOUND');
    const access = (0, studentAccess_1.studentAccess)(req);
    if (!access.management && access.teacher) {
        const owned = await tx.enrollment.findFirst({ where: { id, class: { ...access.campus, teacherId: access.actor.id, status: { not: 'deleted' } }, student: { AND: [(0, studentResponsibility_1.teachingStudentWhere)(access.campus, access.actor.id)] } }, select: { id: true } });
        const receipt = enrollment.removalReceipt;
        const replay = !owned && allowRemovalReplay && enrollment.status === 'cancelled' && enrollment.endedAt && receipt?.actorId === access.actor.id &&
            await tx.student.findFirst({ where: { id: enrollment.studentId, AND: [(0, studentResponsibility_1.recallStudentWhere)(access.campus, access.actor.id)] }, select: { id: true } });
        if (!owned && !replay)
            throw new errorHandler_1.ApiError('只能移除本人负责班级的学员；回访权限不包含他班报名调整', 403, 'FORBIDDEN');
    }
    return enrollment;
}
exports.enrollmentController = {
    getEnrollments: async (req, res, next) => {
        try {
            const { organizationId, campusId } = (0, scope_1.resolveScope)(req), page = Math.max(1, Number(req.query.page) | 0), pageSize = Math.min(1000, Math.max(1, Number(req.query.pageSize || 10) | 0));
            const scope = { organizationId, ...(campusId ? { campusId } : {}) };
            const where = { organizationId, class: scope, student: (0, studentAccess_1.studentAccess)(req).where, ...Object.fromEntries(['studentId', 'classId', 'status'].flatMap(k => typeof req.query[k] === 'string' ? [[k, req.query[k]]] : [])) };
            const [rows, count] = await database_1.default.$transaction([database_1.default.enrollment.findMany({ where, orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize, include: { class: { select: { id: true, name: true, code: true } } } }), database_1.default.enrollment.count({ where })]);
            (0, response_1.sendPaginated)(res, rows, page, pageSize, count);
        }
        catch (error) {
            next(error);
        }
    },
    getEnrollmentById: async (req, res, next) => {
        try {
            const enrollment = await database_1.default.enrollment.findFirst({ where: scopedEnrollmentWhere(req, req.params.id) });
            if (!enrollment)
                throw new errorHandler_1.ApiError('报名记录不存在或无权访问', 404, 'ENROLLMENT_NOT_FOUND');
            (0, response_1.sendSuccess)(res, enrollment);
        }
        catch (error) {
            next(error);
        }
    },
    createEnrollment: async (req, res, next) => {
        try {
            (0, enrollmentPeriod_1.rejectClientEnrollmentPeriod)(req.body);
            const { studentId, classId, notes } = req.body;
            const access = (0, studentAccess_1.studentAccess)(req);
            if (typeof studentId !== 'string' || !studentId || typeof classId !== 'string' || !classId)
                throw new errorHandler_1.ApiError('请选择学员和班级', 400);
            if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000))
                throw new errorHandler_1.ApiError('备注不能超过 2000 字', 400);
            if (req.body.status !== undefined && req.body.status !== 'active')
                throw new errorHandler_1.ApiError('新报名必须为有效状态', 400);
            const enrollment = await database_1.default.$transaction(async (tx) => {
                const student = await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, studentId, access.campus);
                if (student.status !== 'active')
                    throw new errorHandler_1.ApiError('学员当前不可入班', 409, 'STUDENT_UNAVAILABLE');
                if (!await tx.student.findFirst({ where: { ...(0, studentAccess_1.studentAccess)(req).where, id: studentId }, select: { id: true } }))
                    throw new errorHandler_1.ApiError('只能办理本人负责学员的报名', 403);
                const destination = await (0, enrollmentPeriod_1.lockEnrollmentClass)(tx, classId, access.campus);
                if (destination.status !== 'active')
                    throw new errorHandler_1.ApiError('班级已停用', 409, 'CLASS_UNAVAILABLE');
                if (!access.management && access.teacher && (destination.teacherId !== access.actor.id || !await tx.student.findFirst({ where: { id: studentId, AND: [(0, studentResponsibility_1.teachingStudentWhere)(access.campus, access.actor.id)] }, select: { id: true } })))
                    throw new errorHandler_1.ApiError('回访权限不包含入班；请由管理员安排班级', 403, 'RECALL_PROFILE_ONLY');
                if (await tx.enrollment.findFirst({ where: { studentId, classId, status: 'active' } }))
                    throw new errorHandler_1.ApiError('该学员已报名此班级', 409, 'ENROLLMENT_EXISTS');
                await (0, enrollmentPeriod_1.assertEnrollmentCapacity)(tx, classId, destination.capacity);
                return tx.enrollment.create({ data: { organizationId: access.campus.organizationId, studentId, classId, enrolledBy: access.actor.id, enrolledAt: new Date(), notes } });
            });
            (0, response_1.sendSuccess)(res, enrollment, '报名成功', 201);
        }
        catch (error) {
            next(error);
        }
    },
    updateEnrollment: async (req, res, next) => {
        try {
            (0, enrollmentPeriod_1.rejectClientEnrollmentPeriod)(req.body);
            const { status, notes } = req.body;
            if (status !== undefined && !['active', 'completed', 'cancelled'].includes(status))
                throw new errorHandler_1.ApiError('报名状态无效，请使用正式调班操作', 400);
            if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000))
                throw new errorHandler_1.ApiError('备注不能超过 2000 字', 400);
            const updated = await database_1.default.$transaction(async (tx) => {
                const enrollment = await lockScopedEnrollment(tx, req, req.params.id);
                const data = {};
                if (status !== undefined && status !== enrollment.status) {
                    if (enrollment.status !== 'active' || enrollment.endedAt)
                        throw new errorHandler_1.ApiError('以前的报名已经结束，请新建报名以保留历史', 409, 'ENROLLMENT_ALREADY_ENDED');
                    const endedAt = new Date();
                    await (0, enrollmentPeriod_1.assertCanEndEnrollment)(tx, enrollment, endedAt);
                    data.status = status;
                    data.endedAt = endedAt;
                }
                // Repeating the same terminal status does not invent a legacy end date.
                if (notes !== undefined)
                    data.notes = notes;
                if (!Object.keys(data).length)
                    return enrollment;
                return tx.enrollment.update({ where: { id: enrollment.id }, data });
            });
            (0, response_1.sendSuccess)(res, updated, '报名记录更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    removeAsLost: async (req, res, next) => {
        try {
            const access = (0, studentAccess_1.studentAccess)(req);
            if (!access.management && !access.teacher)
                throw new errorHandler_1.ApiError('仅负责老师或管理员可办理退班', 403, 'FORBIDDEN');
            const result = await database_1.default.$transaction(async (tx) => {
                await (0, managementAccess_1.lockManagement)(tx, access.campus.organizationId);
                const actor = await tx.user.findUnique({ where: { id: access.actor.id } });
                if (!actor?.isActive || actor.organizationId !== access.campus.organizationId || actor.campusId !== access.campus.campusId || (0, managementAccess_1.effectiveRole)(actor) !== access.actor.role || actor.isPlatformAdmin !== !!access.actor.isPlatformAdmin)
                    throw new errorHandler_1.ApiError('账号权限已变化，请刷新后重试', 403, 'FORBIDDEN');
                const enrollment = await lockScopedEnrollment(tx, req, req.params.id, true);
                const student = await tx.student.findFirst({ where: { id: enrollment.studentId, ...access.campus } });
                if (!student || student.status === 'archived')
                    throw new errorHandler_1.ApiError('学员不存在或已经归档', 409, 'STUDENT_UNAVAILABLE');
                const endedAt = new Date();
                // Check the original receipt before counting other classes: their state
                // may have changed since a successful request whose response was lost.
                const previous = enrollment.removalReceipt;
                if (previous) {
                    if (enrollment.status !== 'cancelled' || !enrollment.endedAt)
                        throw new errorHandler_1.ApiError('移除记录与报名状态不一致，请联系管理员核对', 409, 'REMOVAL_STATE_CONFLICT');
                    if (previous.payload === JSON.stringify({ mode: 'class-only' }))
                        return { enrollment, studentId: student.id, replayed: true, mode: 'class-only' };
                    const reason = typeof req.body.deleteReason === 'string' ? req.body.deleteReason.trim() : '';
                    if (previous.payload !== JSON.stringify({ reason, recall: req.body.expectedRecallDate }))
                        throw new errorHandler_1.ApiError('该报名已用其他流失资料移除，请刷新后核对', 409, 'REMOVAL_REQUEST_CONFLICT');
                    return { enrollment, studentId: student.id, replayed: true, mode: 'lost' };
                }
                // 2026-11-08 用户拍板：多班学员减课 ≠ 流失——学员仍在其他班在读时，仅结束本班报名，学员状态保持不变。
                const otherActive = await tx.enrollment.count({
                    where: {
                        ...(0, studentResponsibility_1.responsibilityEnrollmentWhere)(access.campus, endedAt), studentId: student.id, id: { not: enrollment.id },
                    },
                });
                if (otherActive > 0) {
                    const payload = JSON.stringify({ mode: 'class-only' });
                    const retainedAttendanceIds = await (0, enrollmentPeriod_1.recordedAttendanceForRemoval)(tx, enrollment, endedAt);
                    const closed = await tx.enrollment.updateMany({
                        where: { id: enrollment.id, organizationId: access.campus.organizationId, status: 'active', endedAt: null },
                        data: { status: 'cancelled', endedAt, removalReceipt: { payload, actorId: access.actor.id, studentId: student.id, endedAt: endedAt.toISOString(), retainedAttendanceIds } },
                    });
                    if (closed.count !== 1)
                        throw new errorHandler_1.ApiError('报名已发生变化，请刷新后核对', 409, 'ENROLLMENT_CHANGED');
                    return { enrollment: await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } }), studentId: student.id, replayed: false, mode: 'class-only' };
                }
                // 最后一个在读班：按流失学员库流程承接（2026-11-07 用户拍板口径不变）
                const reason = typeof req.body.deleteReason === 'string' ? req.body.deleteReason.trim() : '';
                const recall = req.body.expectedRecallDate;
                if (!reason || reason.length > 200 || /[,\n\r]/.test(reason))
                    throw new errorHandler_1.ApiError('请填写流失原因（最多200字，不含换行或逗号）', 400, 'INVALID_LOST_REASON');
                if (typeof recall !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(recall) || !Number.isFinite(+new Date(recall)) || new Date(recall).toISOString().slice(0, 10) !== recall) {
                    throw new errorHandler_1.ApiError('请选择有效的预计召回日期', 400, 'INVALID_RECALL_DATE');
                }
                const input = JSON.stringify({ reason, recall });
                const retainedAttendanceIds = await (0, enrollmentPeriod_1.recordedAttendanceForRemoval)(tx, enrollment, endedAt);
                // Preserve unrelated notes while replacing the two fields shown by the lost-student form.
                const preserved = (student.notes || '').replace(/(?:删除原因|预计召回时间):[^,\n]*/g, '').replace(/^[,\s]+|[,\s]+$/g, '');
                const notes = [preserved, `删除原因:${reason}, 预计召回时间:${recall}`].filter(Boolean).join('\n');
                const closed = await tx.enrollment.updateMany({
                    where: { id: enrollment.id, organizationId: access.campus.organizationId, status: 'active', endedAt: null },
                    data: { status: 'cancelled', endedAt, removalReceipt: { payload: input, actorId: access.actor.id, studentId: student.id, endedAt: endedAt.toISOString(), retainedAttendanceIds } },
                });
                if (closed.count !== 1)
                    throw new errorHandler_1.ApiError('报名已发生变化，请刷新后核对', 409, 'ENROLLMENT_CHANGED');
                const formerClass = await tx.class.findFirst({ where: { id: enrollment.classId, ...access.campus }, select: { teacherId: true, teacher: { select: { role: true, organizationId: true, campusId: true, isPlatformAdmin: true } } } });
                const formerTeacher = formerClass?.teacher;
                const recallTeacherId = formerTeacher && !formerTeacher.isPlatformAdmin && formerTeacher.organizationId === access.campus.organizationId && formerTeacher.campusId === access.campus.campusId && ['teacher', 'coach'].includes(formerTeacher.role) ? formerClass.teacherId : null;
                await tx.student.update({ where: { id: student.id }, data: { status: 'lost', notes, recallTeacherId } });
                return { enrollment: await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } }), studentId: student.id, replayed: false, mode: 'lost' };
            }, { maxWait: 10000, timeout: 20000 });
            (0, response_1.sendSuccess)(res, result, result.mode === 'class-only'
                ? result.replayed ? '此前移除操作已完成，请刷新名单' : '已从本班移除；学员在其他班级仍在读，未转入流失库'
                : result.replayed ? '此前移除操作已完成，请刷新名单' : '已移除并转入流失学员库');
        }
        catch (error) {
            next(error);
        }
    },
    deleteEnrollment: async (req, res, next) => {
        try {
            await database_1.default.$transaction(async (tx) => {
                const enrollment = await lockScopedEnrollment(tx, req, req.params.id);
                const hasHistory = enrollment.status !== 'active' || !!enrollment.endedAt ||
                    await tx.payment.count({ where: { enrollmentId: enrollment.id } }) ||
                    await tx.attendance.count({ where: { studentId: enrollment.studentId, classId: enrollment.classId } }) ||
                    await tx.lessonTransfer.count({ where: { studentId: enrollment.studentId, OR: [{ fromClassId: enrollment.classId }, { toClassId: enrollment.classId }] } }) ||
                    await tx.schedule.count({ where: { classId: enrollment.classId, endTime: { gte: enrollment.enrolledAt, lte: new Date() }, status: { notIn: ['cancelled', 'rescheduled', 'class_paused'] } } });
                if (hasHistory)
                    throw new errorHandler_1.ApiError('报名已有历史，请保留记录并变更状态', 409, 'ENROLLMENT_HAS_HISTORY');
                await tx.enrollment.delete({ where: { id: enrollment.id } });
            });
            (0, response_1.sendSuccess)(res, null, '报名记录删除成功');
        }
        catch (error) {
            next(error);
        }
    },
    transferStudent: async (req, res, next) => {
        try {
            const user = req.user;
            if (!user?.organizationId || !user.campusId || !['admin', 'manager'].includes(user.role))
                throw new errorHandler_1.ApiError('需要校区管理权限', 403, 'FORBIDDEN');
            (0, enrollmentPeriod_1.rejectClientEnrollmentPeriod)(req.body);
            const input = (0, enrollmentTransfer_1.transferRequest)(req.body);
            const actor = { id: user.id, organizationId: user.organizationId, campusId: user.campusId };
            const result = await database_1.default.$transaction(tx => (0, enrollmentTransfer_1.transferEnrollments)(tx, input, actor), { maxWait: 10000, timeout: 20000 });
            (0, response_1.sendSuccess)(res, input.batch ? result : result.transfers[0], '已调班，课时保持不变');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=enrollmentController.js.map