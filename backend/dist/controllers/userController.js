"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const personnelStatisticsService_1 = require("../services/personnelStatisticsService");
const database_1 = __importDefault(require("../config/database"));
const managementAccess_1 = require("../services/managementAccess");
const scheduleConflicts_1 = require("../services/scheduleConflicts");
const experienceScope_1 = require("../utils/experienceScope");
const studentResponsibility_1 = require("../services/studentResponsibility");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const security_1 = require("../config/security");
const logger_1 = require("../middleware/logger");
const managedUsers_1 = require("../services/managedUsers");
// Caller holds the institution class-write lock until the account update commits.
async function assertStaffCanBeDisabled(tx, organizationId, userId) {
    await tx.$queryRaw `SELECT id FROM users WHERE id = ${userId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    // Paused/empty classes still need a responsible teacher. Deleted classes
    // and completed historical occurrences keep their attribution without blocking.
    const classes = await tx.class.findMany({
        where: { organizationId, teacherId: userId, status: { not: 'deleted' } },
        select: { id: true, _count: { select: { enrollments: { where: { status: 'active' } } } } },
    });
    const owner = await tx.user.findUnique({ where: { id: userId }, select: { campusId: true } });
    const campusId = owner?.campusId;
    const { organizationId: _org, campusId: _campus, ...recallResources } = (0, studentResponsibility_1.dormantResourceWhere)({ organizationId, campusId: campusId || '__unassigned__' });
    const [leads, experiences, students] = await Promise.all([
        tx.lead.count({ where: { organizationId, assigneeId: userId, status: { notIn: ['converted', 'lost'] } } }),
        tx.experienceLesson.count({ where: { organizationId, assigneeId: userId, status: { notIn: ['converted', 'cancelled'] } } }),
        tx.student.count({ where: { organizationId, recallTeacherId: userId, ...recallResources } }),
    ]);
    if (classes.length || leads || experiences || students) {
        const [localClasses, localExperiences, localStudents] = campusId ? await Promise.all([
            tx.class.count({ where: { organizationId, campusId, teacherId: userId, status: { not: 'deleted' } } }),
            tx.experienceLesson.count({ where: { ...(0, experienceScope_1.experienceScopeWhere)(organizationId, campusId), assigneeId: userId, status: { notIn: ['converted', 'cancelled'] } } }),
            tx.student.count({ where: { ...(0, studentResponsibility_1.dormantResourceWhere)({ organizationId, campusId }), recallTeacherId: userId } }),
        ]) : [0, 0, 0];
        if (localClasses !== classes.length || localExperiences !== experiences || localStudents !== students)
            throw new errorHandler_1.ApiError('该工作人员存在其他校区或未归属校区的待交接资源，请联系平台管理员核对处理后再停用或删除。', 409, 'STAFF_CROSS_CAMPUS_RESPONSIBILITIES');
        const items = [classes.length && `${classes.length} 个班级`, leads && `${leads} 条鱼池线索`, experiences && `${experiences} 条体验课`, students && `${students} 名待回访学员`].filter(Boolean).join('、');
        throw new errorHandler_1.ApiError(`该工作人员仍负责 ${items}，请先在“资源交接”中处理，再停用或删除。`, 409, 'STAFF_HAS_RESPONSIBILITIES');
    }
}
// Caller holds management and class-write locks through the job change. Sales
// follow-ups can stay with a sales/staff account; teaching and recall work cannot.
async function assertTeachingResourcesTransferred(tx, organizationId, userId, campusId) {
    const { organizationId: _org, campusId: _campus, ...recallResources } = (0, studentResponsibility_1.dormantResourceWhere)({ organizationId, campusId: campusId || '__unassigned__' });
    const [classes, students] = await Promise.all([
        tx.class.count({ where: { organizationId, teacherId: userId, status: { not: 'deleted' } } }),
        tx.student.count({ where: { organizationId, recallTeacherId: userId, ...recallResources } }),
    ]);
    if (classes || students) {
        const items = [classes && `${classes} 个班级（含停课班、空班）`, students && `${students} 名待回访学员`].filter(Boolean).join('、');
        throw new errorHandler_1.ApiError(`该老师仍负责 ${items}，请先在“资源交接”中完成班级和沉默学员交接，再改为非教师岗位。`, 409, 'TEACHER_ROLE_HAS_RESPONSIBILITIES');
    }
}
exports.userController = {
    getUsers: async (req, res, next) => {
        try {
            const scope = (0, managedUsers_1.staffScope)(req), role = String(req.query.role || '')
                .split(',')
                .filter(Boolean), q = String(req.query.search || '').trim();
            const page = Math.max(1, Number(req.query.page) | 0), pageSize = Math.max(1, Math.min(1000, Number(req.query.pageSize || 10) | 0));
            const where = {
                ...scope,
                ...(role.length ? { role: { in: role } } : {}),
                ...(q
                    ? {
                        OR: [
                            { name: { contains: q } },
                            { email: { contains: q } },
                            { phone: { contains: q } },
                        ],
                    }
                    : {}),
            };
            const [rows, count] = await database_1.default.$transaction([
                database_1.default.user.findMany({
                    where,
                    select: managedUsers_1.userFields,
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                }),
                database_1.default.user.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, rows.map(managementAccess_1.staffUser), page, pageSize, count);
        }
        catch (e) {
            next(e);
        }
    },
    getUserById: async (req, res, next) => {
        try {
            const row = await database_1.default.user.findFirst({
                where: { id: req.params.id, ...(0, managedUsers_1.staffScope)(req) },
                select: managedUsers_1.userFields,
            });
            if (!row)
                (0, managedUsers_1.fail)('用户不存在', 404);
            (0, response_1.sendSuccess)(res, (0, managementAccess_1.staffUser)(row));
        }
        catch (e) {
            next(e);
        }
    },
    createUser: async (req, res, next) => {
        try {
            (0, response_1.sendSuccess)(res, await (0, managedUsers_1.createManaged)(req, req.body.role), '账号已创建', 201);
        }
        catch (e) {
            next(e);
        }
    },
    updateUser: async (req, res, next) => {
        try {
            const actor = req.user, scope = (0, managedUsers_1.staffScope)(req);
            const target = await database_1.default.user.findFirst({
                where: { ...scope, id: req.params.id },
                select: managedUsers_1.userFields,
            });
            if (!target)
                throw new errorHandler_1.ApiError('用户不存在', 404);
            const { role, name, phone, email, isActive } = req.body;
            const expected = req.body.expectedUpdatedAt;
            if (expected !== undefined && (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected))))
                (0, managedUsers_1.fail)('账号版本无效，请刷新人员列表后重试');
            // Current clients send the opened form's version. Older clients still get
            // a compare-and-swap baseline for changes occurring during this request.
            const expectedTime = expected === undefined ? target.updatedAt : new Date(expected);
            if (Object.prototype.hasOwnProperty.call(req.body, 'password'))
                (0, managedUsers_1.fail)('请通过“重置密码”操作修改工作人员密码', 403);
            if (['managementLevel', 'managementGrantedById', 'managementGrantedAt', 'isPlatformAdmin'].some(key => key in req.body) || (role !== undefined && !managedUsers_1.employeeRoles.includes(role)))
                (0, managedUsers_1.fail)('管理身份请通过“设为／取消机构管理员”专用操作调整', 403);
            if (target.role === 'parent' && (role || phone !== undefined || email !== undefined))
                (0, managedUsers_1.fail)('家长绑定关系不能通过员工编辑变更', 403);
            if (req.body.campusId && req.body.campusId !== target.campusId)
                (0, managedUsers_1.fail)('不能通过员工编辑变更校区');
            const normalizedPhone = phone === undefined
                ? undefined
                : phone === null || phone === ''
                    ? null
                    : (0, managedUsers_1.normalizePhone)(phone);
            const normalizedEmail = email === undefined ? undefined :
                email === null || (typeof email === 'string' && !email.trim()) ? null : (0, managedUsers_1.validEmail)(email);
            if (isActive !== undefined && typeof isActive !== 'boolean')
                (0, managedUsers_1.fail)('启用状态无效');
            const changed = await database_1.default.$transaction(async (tx) => {
                await (0, managementAccess_1.lockManagement)(tx, scope.organizationId);
                const latestActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
                if (!latestActor.isActive || latestActor.organizationId !== scope.organizationId || latestActor.campusId !== actor.campusId || !['admin', 'manager'].includes((0, managementAccess_1.effectiveRole)(latestActor)))
                    (0, managedUsers_1.fail)('管理权限已变化，请刷新后重试', 403);
                const current = await tx.user.findFirstOrThrow({ where: { id: target.id, ...scope }, select: managedUsers_1.userFields });
                (0, managementAccess_1.assertEditableAccount)({ ...actor, managementLevel: latestActor.managementLevel }, current, isActive === false);
                if (current.updatedAt.getTime() !== expectedTime.getTime())
                    throw new errorHandler_1.ApiError('账号资料已变化，请重新打开编辑窗口后再修改', 409, 'ACCOUNT_CHANGED');
                if (normalizedPhone !== undefined && normalizedPhone !== current.phone &&
                    latestActor.managementLevel !== 'super' && !latestActor.isPlatformAdmin) {
                    (0, managedUsers_1.fail)('仅超级机构管理员可修改登录手机号', 403);
                }
                if (normalizedEmail !== undefined && normalizedEmail !== (current.email?.trim().toLowerCase() || null) &&
                    latestActor.managementLevel !== 'super' && !latestActor.isPlatformAdmin) {
                    (0, managedUsers_1.fail)('仅超级机构管理员可修改登录邮箱', 403);
                }
                if (normalizedPhone !== undefined || normalizedEmail !== undefined) {
                    const nextPhone = normalizedPhone === undefined ? current.phone : normalizedPhone;
                    const nextEmail = normalizedEmail === undefined ? current.email : normalizedEmail;
                    if (!nextPhone && !nextEmail)
                        (0, managedUsers_1.fail)('手机号和邮箱至少保留一项，不能移除唯一登录方式');
                }
                if (normalizedEmail && await tx.user.findFirst({
                    where: { email: { equals: normalizedEmail, mode: 'insensitive' }, id: { not: current.id } },
                    select: { id: true },
                }))
                    throw new errorHandler_1.ApiError('邮箱已被其他账号使用', 409, 'IDENTITY_EXISTS');
                const leavingTeaching = ['teacher', 'coach'].includes(current.role) && role !== undefined && !['teacher', 'coach'].includes(role);
                if (isActive === false || leavingTeaching) {
                    await (0, scheduleConflicts_1.lockScheduleWrites)(tx, scope.organizationId);
                }
                if (leavingTeaching) {
                    await assertTeachingResourcesTransferred(tx, scope.organizationId, target.id, current.campusId);
                }
                if (isActive === false) {
                    await assertStaffCanBeDisabled(tx, scope.organizationId, target.id);
                }
                return tx.user.updateMany({
                    where: { id: target.id, ...scope, updatedAt: expectedTime },
                    data: {
                        ...(name !== undefined ? { name: (0, managedUsers_1.textField)(name, '姓名') } : {}),
                        ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
                        ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
                        role,
                        isActive,
                        updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
                    },
                });
            });
            if (!changed.count)
                (0, managedUsers_1.fail)('账号已变更，请刷新', 409);
            (0, response_1.sendSuccess)(res, (0, managementAccess_1.staffUser)(await database_1.default.user.findFirstOrThrow({ where: { id: target.id, ...scope }, select: managedUsers_1.userFields })));
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                return next(new errorHandler_1.ApiError(String(e.meta?.target || '').includes('email') ? '邮箱已被其他账号使用' : '手机号已被其他账号使用', 409, 'IDENTITY_EXISTS'));
            next(e);
        }
    },
    resetStaffPassword: async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const actor = req.user, scope = (0, managedUsers_1.staffScope)(req);
            if (actor.managementLevel !== 'super')
                (0, managedUsers_1.fail)('仅超级机构管理员可重置工作人员密码', 403);
            if (req.params.id === actor.id)
                (0, managedUsers_1.fail)('请通过个人菜单修改自己的密码', 409);
            const expected = req.body.expectedUpdatedAt;
            if (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected)))
                (0, managedUsers_1.fail)('请刷新人员列表后重新确认重置');
            if ('password' in req.body || 'newPassword' in req.body)
                (0, managedUsers_1.fail)('新密码由系统生成，无需提交密码');
            const expectedTime = new Date(expected);
            const newPassword = (0, security_1.generateSecurePassword)();
            const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
            const account = await database_1.default.$transaction(async (tx) => {
                await (0, managementAccess_1.lockManagement)(tx, scope.organizationId);
                const latestActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
                if (!latestActor.isActive || latestActor.organizationId !== scope.organizationId ||
                    latestActor.campusId !== actor.campusId || latestActor.managementLevel !== 'super')
                    (0, managedUsers_1.fail)('管理权限已变化，请刷新后重试', 403);
                const target = await tx.user.findFirst({
                    where: { ...scope, id: req.params.id },
                    select: { ...managedUsers_1.userFields, password: true },
                });
                if (!target)
                    throw new errorHandler_1.ApiError('工作人员不存在或不属于本机构', 404);
                (0, managementAccess_1.assertEditableAccount)({ ...actor, managementLevel: latestActor.managementLevel }, target);
                if (target.role === 'parent')
                    (0, managedUsers_1.fail)('请通过学员管理处理家长账号密码', 403);
                if (!target.isActive)
                    (0, managedUsers_1.fail)('该工作人员已停用，不能重置密码', 409);
                if (target.updatedAt.getTime() !== expectedTime.getTime())
                    throw new errorHandler_1.ApiError('账号资料已变化，请刷新列表后重新确认重置', 409, 'ACCOUNT_CHANGED');
                const changed = await tx.user.updateMany({
                    where: { ...scope, id: target.id, isActive: true, password: target.password, updatedAt: expectedTime },
                    data: { password: passwordHash },
                });
                if (changed.count !== 1)
                    throw new errorHandler_1.ApiError('账号资料已变化，请刷新列表后重新确认重置', 409, 'ACCOUNT_CHANGED');
                return { id: target.id, name: target.name, phone: target.phone, email: target.email };
            });
            // Never include the generated password or password hash in audit logs.
            try {
                logger_1.logger.audit('staff-password-reset', { actorId: actor.id, targetId: account.id, organizationId: scope.organizationId });
            }
            catch {
                console.warn('工作人员密码已重置，审计日志写入失败');
            }
            (0, response_1.sendSuccess)(res, { ...account, newPassword }, '密码已重置，新密码仅本次显示');
        }
        catch (e) {
            next(e);
        }
    },
    deleteUser: async (req, res, next) => {
        try {
            const actor = req.user;
            if (req.params.id === actor.id)
                (0, managedUsers_1.fail)('不能停用自己的账号', 409);
            const scope = (0, managedUsers_1.staffScope)(req);
            await database_1.default.$transaction(async (tx) => {
                await (0, managementAccess_1.lockManagement)(tx, scope.organizationId);
                const latestActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
                if (!latestActor.isActive || latestActor.organizationId !== scope.organizationId || latestActor.campusId !== actor.campusId || !['admin', 'manager'].includes((0, managementAccess_1.effectiveRole)(latestActor)))
                    (0, managedUsers_1.fail)('管理权限已变化，请刷新后重试', 403);
                // Share the class/transfer write lock: a new responsibility cannot appear
                // between the ownership check and disabling this account.
                await (0, scheduleConflicts_1.lockScheduleWrites)(tx, scope.organizationId);
                const where = {
                    ...scope,
                    id: req.params.id,
                    role: {
                        in: [...managedUsers_1.employeeRoles, 'parent', 'admin', 'manager', 'super_admin'],
                    },
                };
                const target = await tx.user.findFirst({ where, select: managedUsers_1.userFields });
                if (!target)
                    (0, managedUsers_1.fail)('无权停用此账号', 403);
                (0, managementAccess_1.assertEditableAccount)({ ...actor, managementLevel: latestActor.managementLevel }, target, true);
                await assertStaffCanBeDisabled(tx, scope.organizationId, req.params.id);
                const result = await tx.user.updateMany({ where, data: { isActive: false } });
                if (!result.count)
                    (0, managedUsers_1.fail)('账号已变更，请刷新', 409);
            });
            (0, response_1.sendSuccess)(res, null, '账号已停用，业务记录已保留');
        }
        catch (e) {
            next(e);
        }
    },
    changeManagement: async (req, res, next) => {
        try {
            (0, response_1.sendSuccess)(res, await (0, managementAccess_1.changeManagement)(req.user, (0, managedUsers_1.staffScope)(req).organizationId, req.params.id, req.body.managementLevel, req.body.expectedLevel), '管理身份已更新');
        }
        catch (e) {
            next(e);
        }
    },
    getTeachers: async (req, res, next) => {
        try {
            (0, response_1.sendSuccess)(res, await (0, personnelStatisticsService_1.personnelOptions)(req));
        }
        catch (error) {
            next(error);
        }
    },
    getCoachStatistics: async (req, res, next) => {
        try {
            (0, response_1.sendSuccess)(res, await (0, personnelStatisticsService_1.teachingPerformance)(req));
        }
        catch (error) {
            next(error);
        }
    },
    getSalesStatistics: async (req, res, next) => {
        try {
            (0, response_1.sendSuccess)(res, await (0, personnelStatisticsService_1.salesPerformance)(req));
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=userController.js.map