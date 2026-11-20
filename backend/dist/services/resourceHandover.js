"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourceRoles = exports.teachingRoles = void 0;
exports.handoverInput = handoverInput;
exports.lockHandover = lockHandover;
exports.planHandover = planHandover;
exports.assertHandoverAvailable = assertHandoverAvailable;
exports.applyHandover = applyHandover;
const errorHandler_1 = require("../middleware/errorHandler");
const managementAccess_1 = require("./managementAccess");
const scheduleConflicts_1 = require("./scheduleConflicts");
const classScheduleStatus_1 = require("./classScheduleStatus");
const studentResponsibility_1 = require("./studentResponsibility");
// Job roles are independent of institutional management authority.
exports.teachingRoles = ['teacher', 'coach'];
exports.sourceRoles = [...exports.teachingRoles, 'staff', 'sales', 'super_admin'];
function handoverInput(body) {
    const { fromTeacherId, toTeacherId, classIds, notes } = body;
    if (typeof fromTeacherId !== 'string' || !fromTeacherId || typeof toTeacherId !== 'string' || !toTeacherId || fromTeacherId === toTeacherId ||
        (classIds !== undefined && (!Array.isArray(classIds) || !classIds.length || classIds.length > 1000 || classIds.some((id) => typeof id !== 'string' || !id) || new Set(classIds).size !== classIds.length)) ||
        (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)))
        throw new errorHandler_1.ApiError('请选择不同的交接老师及至少一个班级，备注不超过2000字', 400, 'INVALID_PARAMS');
    // Omitted classIds retains the legacy all-classes contract; [] must never mean all.
    return { fromTeacherId, toTeacherId, classIds, notes };
}
/** Same lock order as staff deactivation. Recheck authority after waiting. */
async function lockHandover(tx, actor) {
    await (0, managementAccess_1.lockManagement)(tx, actor.organizationId);
    await (0, scheduleConflicts_1.lockScheduleWrites)(tx, actor.organizationId);
    const current = await tx.user.findUnique({ where: { id: actor.id } });
    if (!current?.isActive || current.isPlatformAdmin || current.organizationId !== actor.organizationId || current.campusId !== actor.campusId || (0, managementAccess_1.effectiveRole)(current) !== 'manager')
        throw new errorHandler_1.ApiError('管理权限已变化，请刷新后重试', 403, 'FORBIDDEN');
    return current;
}
async function planHandover(tx, actor, input, now = new Date()) {
    const scope = { organizationId: actor.organizationId, campusId: actor.campusId };
    const from = await tx.user.findFirst({ where: { ...scope, id: input.fromTeacherId, isPlatformAdmin: false, role: { in: exports.teachingRoles } } });
    const to = await tx.user.findFirst({ where: { ...scope, id: input.toTeacherId, isActive: true, isPlatformAdmin: false, role: { in: exports.teachingRoles } } });
    if (!from || !to)
        throw new errorHandler_1.ApiError('请选择本机构待交接人员和在职接课老师', 403, 'TEACHER_UNAVAILABLE');
    const classes = await tx.class.findMany({ where: { ...scope, teacherId: from.id, status: { not: 'deleted' }, ...(input.classIds ? { id: { in: input.classIds } } : {}) }, select: { id: true, name: true, status: true, organizationId: true, campusId: true }, orderBy: { id: 'asc' } });
    if (input.classIds && classes.length !== input.classIds.length)
        throw new errorHandler_1.ApiError('所选班级已交接或不属于该老师，请刷新资源后重试', 409, 'RESOURCE_CHANGED');
    if (!classes.length)
        throw new errorHandler_1.ApiError('该老师已没有待交接班级，请刷新列表', 409, 'NO_TRANSFER_RESOURCES');
    const ids = classes.map(cls => cls.id);
    const pendingWhere = { ...scope, classId: { in: ids }, teacherId: from.id, startTime: { gt: now }, status: { in: ['scheduled', scheduleConflicts_1.CLASS_PAUSED] } };
    const initial = await tx.schedule.findMany({ where: pendingWhere, select: { id: true }, orderBy: { id: 'asc' } });
    for (const item of initial)
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${item.id}))`;
    // A concurrent check-in may have completed an occurrence while we waited.
    const pending = await tx.schedule.findMany({ where: { ...pendingWhere, id: { in: initial.map(item => item.id) } }, include: { class: { select: { name: true, status: true } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] });
    const visible = pending.filter(row => row.status === 'scheduled' && row.class.status !== 'inactive');
    const existing = visible.length ? await tx.schedule.findMany({ where: { organizationId: scope.organizationId, teacherId: to.id, status: { notIn: ['cancelled', 'rescheduled'] }, NOT: (0, scheduleConflicts_1.hiddenTimetableOccurrence)(), startTime: { lt: new Date(Math.max(...visible.map(row => +row.endTime))) }, endTime: { gt: new Date(Math.min(...visible.map(row => +row.startTime))) } }, include: { class: { select: { name: true } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] }) : [];
    const conflicts = [];
    // Only teacher ownership changes. Do not reject old, unchanged room/class overlaps.
    for (let i = 0; i < visible.length; i++) {
        const row = visible[i];
        for (const other of [...existing, ...visible.slice(0, i)]) {
            if (row.startTime < other.endTime && row.endTime > other.startTime)
                conflicts.push({ className: row.class.name, startTime: row.startTime, endTime: row.endTime, conflictingClassName: other.campusId === scope.campusId ? other.class.name : '其他校区班级', conflictingStartTime: other.startTime, conflictingEndTime: other.endTime });
        }
    }
    const details = { classes: ids, schedules: pending.map(row => row.id), classCount: ids.length, scheduleCount: pending.length, studentCount: await tx.enrollment.count({ where: { organizationId: scope.organizationId, classId: { in: ids }, status: 'active' } }) };
    return { from, to, classes, pending, conflicts, details };
}
const localTime = (date) => date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
function assertHandoverAvailable(plan) {
    const first = plan.conflicts[0];
    if (first)
        throw new errorHandler_1.ApiError(`无法交接：${plan.to.name}在北京时间 ${localTime(first.startTime)} 至 ${localTime(first.endTime)}，接手「${first.className}」会与「${first.conflictingClassName}」冲突。请调整勾选班级或先调课。`, 409, 'SCHEDULE_CONFLICT');
}
async function applyHandover(tx, plan, deferRecallSync = false) {
    for (const cls of plan.classes)
        if (cls.status === 'inactive')
            await (0, classScheduleStatus_1.syncClassScheduleStatus)(tx, cls, 'inactive');
    const scope = { organizationId: plan.classes[0].organizationId, campusId: plan.classes[0].campusId };
    const recallStudents = deferRecallSync ? [] : await (0, studentResponsibility_1.lockHandoverRecallStudents)(tx, scope, plan.details.classes, plan.from.id);
    // Future substitutes remain their own teachers; completed and historical rows never change.
    await tx.schedule.updateMany({ where: { id: { in: plan.pending.map(row => row.id) }, teacherId: plan.from.id, status: { in: ['scheduled', scheduleConflicts_1.CLASS_PAUSED] } }, data: { teacherId: plan.to.id } });
    await tx.class.updateMany({ where: { id: { in: plan.details.classes }, teacherId: plan.from.id }, data: { teacherId: plan.to.id } });
    if (!deferRecallSync)
        await (0, studentResponsibility_1.syncHandoverRecallTeachers)(tx, scope, recallStudents, plan.from.id);
}
//# sourceMappingURL=resourceHandover.js.map