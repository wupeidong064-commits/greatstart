"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.followUpRoutes = void 0;
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const client_1 = require("@prisma/client");
const staffWork_1 = require("./staffWork");
exports.followUpRoutes = (0, express_1.Router)();
exports.followUpRoutes.use(auth_1.authenticate, (0, rbac_1.requireOrganizationAccess)());
function actor(req) {
    const u = req.user;
    if (!u?.id || !u.organizationId || !u.campusId || !['admin', 'manager', 'sales', 'coach', 'teacher', 'staff'].includes(u.role || ''))
        throw new errorHandler_1.ApiError('当前账号无法处理校区待办', 403, 'FORBIDDEN');
    return { userId: u.id, organizationId: u.organizationId, campusId: u.campusId };
}
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
exports.followUpRoutes.get('/', async (req, res, next) => {
    try {
        const scope = actor(req);
        const day = today();
        if ((0, staffWork_1.isEmployeeWorkRole)(req.user?.role)) {
            const data = await database_1.default.$transaction(tx => (0, staffWork_1.buildStaffWork)((0, staffWork_1.employeeActor)(req), tx, day), { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
            return (0, response_1.sendSuccess)(res, { day, records: data.tasks.filter(task => task.done).map(task => ({ key: JSON.stringify([scope.organizationId, scope.campusId, scope.userId, day, task.key, task.revision]), day, completedAt: task.completedAt })) });
        }
        const rows = await database_1.default.followUpCompletion.findMany({ where: { ...scope, day, done: true }, select: { taskKey: true, revision: true, updatedAt: true } });
        (0, response_1.sendSuccess)(res, { day, records: rows.map(r => ({ key: JSON.stringify([scope.organizationId, scope.campusId, scope.userId, day, r.taskKey, r.revision]), day, completedAt: r.updatedAt.toISOString() })) });
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2034')
            return next(new errorHandler_1.ApiError('工作记录已变化，请刷新重试', 409, 'WORK_CONFLICT'));
        next(e);
    }
});
exports.followUpRoutes.put('/', async (req, res, next) => {
    try {
        const scope = actor(req);
        const { taskKey, revision, done } = req.body;
        if (typeof taskKey !== 'string' || taskKey.length > 200 || typeof revision !== 'string' || revision.length > 500 || typeof done !== 'boolean')
            throw new errorHandler_1.ApiError('跟进参数无效', 400, 'INVALID_TASK');
        const principal = req.user;
        const managementMode = req.body.mode === 'management';
        if (managementMode && !['admin', 'manager'].includes(principal?.role || ''))
            throw new errorHandler_1.ApiError('无权使用管理员待办', 403, 'FORBIDDEN');
        if (!managementMode && ((0, staffWork_1.isEmployeeWorkRole)(principal?.role) || (req.body.day !== undefined && (0, staffWork_1.isEmployeeWorkRole)(principal?.jobRole || undefined)))) {
            const actor = (0, staffWork_1.employeeActor)(req);
            const day = (0, staffWork_1.workDay)();
            if (req.body.day !== day)
                throw new errorHandler_1.ApiError('日期已变化，请刷新今日工作', 409, 'STALE_WORK_DAY');
            const row = await database_1.default.$transaction(async (tx) => {
                const work = await (0, staffWork_1.buildStaffWork)(actor, tx, day);
                const task = work.tasks.find(item => item.key === taskKey);
                if (!task)
                    throw new errorHandler_1.ApiError('无权处理此待办或其风险已解除，请刷新', 403, 'FORBIDDEN');
                if (task.revision !== revision)
                    throw new errorHandler_1.ApiError('待办事实已变化，请刷新后处理', 409, 'STALE_WORK_TASK');
                return tx.followUpCompletion.upsert({ where: { userId_campusId_day_taskKey_revision: { userId: actor.userId, campusId: actor.campusId, day, taskKey, revision } }, create: { organizationId: actor.organizationId, campusId: actor.campusId, userId: actor.userId, day, taskKey, revision, done }, update: { done } });
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
            return (0, response_1.sendSuccess)(res, { day, taskKey, revision, done: row.done, completedAt: row.updatedAt.toISOString() });
        }
        // Older management clients omitted day; current management UI sends the displayed day.
        // When supplied, reject a stale page before writing any completion for the new day.
        if (req.body.day !== undefined && req.body.day !== today())
            throw new errorHandler_1.ApiError('日期已变化，请刷新今日工作', 409, 'STALE_WORK_DAY');
        const [category, id, classId] = taskKey.split(':');
        if (!id)
            throw new errorHandler_1.ApiError('缺少待办对象', 400, 'INVALID_TASK');
        let allowed = false;
        if (category === 'lowClasses')
            allowed = !!await database_1.default.class.findFirst({ where: { id, organizationId: scope.organizationId, campusId: scope.campusId } });
        if (category === 'renewal' || category === 'lowStudents') {
            allowed = !!await database_1.default.student.findFirst({ where: { id, organizationId: scope.organizationId, campusId: scope.campusId } });
            if (classId && allowed) {
                const where = { studentId: id, classId, organizationId: scope.organizationId, class: { organizationId: scope.organizationId, campusId: scope.campusId } };
                const [enrollment, temporary] = await Promise.all([
                    database_1.default.enrollment.findFirst({ where, select: { id: true } }),
                    database_1.default.attendance.findFirst({ where: { ...where, isTemporary: true, schedule: { organizationId: scope.organizationId, classId, status: 'completed' } }, select: { id: true } }),
                ]);
                allowed = Boolean(enrollment || temporary);
            }
        }
        if (category === 'lead') {
            const users = await database_1.default.user.findMany({ where: { organizationId: scope.organizationId, campusId: scope.campusId }, select: { id: true } });
            allowed = !!await database_1.default.lead.findFirst({ where: { id, organizationId: scope.organizationId, OR: [{ assignee: { organizationId: scope.organizationId, campusId: scope.campusId } }, { assigneeId: null, createdById: { in: users.map(u => u.id) } }] } });
        }
        if (category === 'experience')
            allowed = !!await database_1.default.experienceLesson.findFirst({ where: { id, organizationId: scope.organizationId, OR: [{ class: { campusId: scope.campusId } }, { classId: null, assignee: { campusId: scope.campusId, organizationId: scope.organizationId } }] } });
        if (!allowed)
            throw new errorHandler_1.ApiError('无权访问该待办对象', 403, 'FORBIDDEN');
        const day = today();
        const row = await database_1.default.followUpCompletion.upsert({ where: { userId_campusId_day_taskKey_revision: { userId: scope.userId, campusId: scope.campusId, day, taskKey, revision } }, create: { ...scope, day, taskKey, revision, done }, update: { done } });
        (0, response_1.sendSuccess)(res, { day, done: row.done, completedAt: row.updatedAt.toISOString() });
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2034')
            return next(new errorHandler_1.ApiError('工作记录已变化，请刷新重试', 409, 'WORK_CONFLICT'));
        next(e);
    }
});
//# sourceMappingURL=followUps.js.map