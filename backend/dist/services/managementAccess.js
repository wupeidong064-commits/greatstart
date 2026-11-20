"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.managementError = exports.staffUser = exports.sessionUser = exports.jobRole = exports.managementLevels = void 0;
exports.effectiveRole = effectiveRole;
exports.assertEditableAccount = assertEditableAccount;
exports.lockManagement = lockManagement;
exports.changeManagement = changeManagement;
const errorHandler_1 = require("../middleware/errorHandler");
const database_1 = __importDefault(require("../config/database"));
exports.managementLevels = ['none', 'manager', 'super'];
const jobRole = (user) => ['admin', 'manager', 'super_admin'].includes(user.role) ? null : user.role;
exports.jobRole = jobRole;
// Existing controllers use role as an effective capability; storage retains the employee's job.
function effectiveRole(user) {
    if (user.isPlatformAdmin)
        return 'admin';
    // Both institution levels have the same business capability. Appointment authority
    // is checked separately, and existing acceptance clients remain compatible.
    if (user.managementLevel === 'super' || user.managementLevel === 'manager')
        return 'manager';
    return (0, exports.jobRole)(user) || 'staff';
}
const sessionUser = (user) => ({ ...user, jobRole: (0, exports.jobRole)(user), role: effectiveRole(user) });
exports.sessionUser = sessionUser;
const staffUser = (user) => {
    const { password: _password, ...safe } = user;
    return { ...safe, jobRole: (0, exports.jobRole)(user), role: (0, exports.jobRole)(user) || 'staff' };
};
exports.staffUser = staffUser;
const managementError = (message, code = 'MANAGEMENT_FORBIDDEN') => new errorHandler_1.ApiError(message, 403, code);
exports.managementError = managementError;
function assertEditableAccount(actor, target, disabling = false) {
    if (target.isPlatformAdmin)
        throw (0, exports.managementError)('系统管理员账号不能在机构内修改');
    if (target.managementLevel === 'super' && (disabling || target.id !== actor.id))
        throw (0, exports.managementError)('超级机构管理员由系统管理员指定，机构内不能更改、停用或删除该账号', 'SUPER_ADMIN_PROTECTED');
    if (target.managementLevel === 'manager' && actor.managementLevel !== 'super' && (disabling || target.id !== actor.id))
        throw (0, exports.managementError)('只有超级机构管理员可以管理其他机构管理员账号');
}
async function lockManagement(tx, organizationId) {
    await tx.$executeRaw `SELECT pg_advisory_xact_lock(1735352948, hashtext(${organizationId}))`;
}
async function changeManagement(actor, organizationId, userId, level, expectedLevel) {
    if (typeof level !== 'string' || !exports.managementLevels.includes(level) || typeof expectedLevel !== 'string' || !exports.managementLevels.includes(expectedLevel))
        throw new errorHandler_1.ApiError('管理身份或原身份无效，请刷新后重试', 400, 'INVALID_MANAGEMENT_LEVEL');
    return database_1.default.$transaction(async (tx) => {
        await lockManagement(tx, organizationId);
        // Revalidate actor inside the same lock; an old token cannot retain revoked authority.
        const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
        if (!currentActor?.isActive)
            throw (0, exports.managementError)('当前账号已停用');
        const platform = currentActor.isPlatformAdmin;
        if (!platform && (currentActor.organizationId !== organizationId || currentActor.managementLevel !== 'super'))
            throw (0, exports.managementError)('只有超级机构管理员可以设置或取消本机构管理员');
        const target = await tx.user.findFirst({ where: { id: userId, organizationId, isPlatformAdmin: false } });
        if (!target)
            throw new errorHandler_1.ApiError('工作人员不存在或不属于该机构', 404, 'USER_NOT_FOUND');
        if (target.role === 'parent')
            throw (0, exports.managementError)('家长账号不能授予机构管理权限');
        if (!target.isActive && level !== 'none')
            throw new errorHandler_1.ApiError('请先启用该工作人员账号', 409, 'USER_INACTIVE');
        if (!platform && (target.managementLevel === 'super' || level === 'super'))
            throw (0, exports.managementError)('超级机构管理员仅由系统管理员任免', 'SUPER_ADMIN_PROTECTED');
        if (target.managementLevel !== expectedLevel)
            throw new errorHandler_1.ApiError('管理身份已变化，请刷新后重试', 409, 'MANAGEMENT_CONFLICT');
        if (target.managementLevel === level)
            return (0, exports.staffUser)(target);
        // A live institution must retain an appointed super administrator during replacement.
        if (target.managementLevel === 'super' && level !== 'super' &&
            await tx.user.count({ where: { organizationId, isActive: true, isPlatformAdmin: false, managementLevel: 'super', id: { not: userId } } }) === 0)
            throw new errorHandler_1.ApiError('请先指定一位新的超级机构管理员，再取消当前任命', 409, 'LAST_SUPER_ADMIN');
        const updated = await tx.user.update({ where: { id: target.id }, data: {
                managementLevel: level, managementGrantedById: level === 'none' ? null : actor.id,
                managementGrantedAt: level === 'none' ? null : new Date(),
            } });
        await tx.userManagementEvent.create({ data: { organizationId, actorId: actor.id, userId, fromLevel: target.managementLevel,
                toLevel: level, jobRole: (0, exports.jobRole)(target), origin: platform ? 'platform-appointment' : 'super-admin-appointment' } });
        return (0, exports.staffUser)(updated);
    });
}
//# sourceMappingURL=managementAccess.js.map