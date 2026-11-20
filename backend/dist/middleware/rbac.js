"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformOnly = exports.requireOrganizationAccess = exports.requireMinRole = exports.requireRole = exports.normalizeRole = void 0;
const errorHandler_1 = require("./errorHandler");
const roleHierarchy = {
    admin: 5,
    manager: 4,
    teacher: 3,
    coach: 3,
    sales: 3,
    staff: 2,
    parent: 1,
};
const roleMapping = {
    teacher: 'coach',
};
const normalizeRole = (role) => {
    return roleMapping[role] || role;
};
exports.normalizeRole = normalizeRole;
const requireRole = (...allowedRoles) => {
    return (req, _res, next) => {
        const user = req.user;
        if (!user) {
            return next(new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED'));
        }
        const normalizedRole = (0, exports.normalizeRole)(user.role || '');
        if (!allowedRoles.includes(normalizedRole)) {
            return next(new errorHandler_1.ApiError('权限不足', 403, 'FORBIDDEN'));
        }
        next();
    };
};
exports.requireRole = requireRole;
const requireMinRole = (minRole) => {
    return (req, _res, next) => {
        const user = req.user;
        if (!user) {
            return next(new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED'));
        }
        const normalizedRole = (0, exports.normalizeRole)(user.role || '');
        const userRoleLevel = roleHierarchy[normalizedRole] || 0;
        const minRoleLevel = roleHierarchy[minRole];
        if (userRoleLevel < minRoleLevel) {
            return next(new errorHandler_1.ApiError('权限不足', 403, 'FORBIDDEN'));
        }
        next();
    };
};
exports.requireMinRole = requireMinRole;
// 数据隔离中间件：确保用户只能访问自己机构/校区的数据
const requireOrganizationAccess = () => {
    return async (req, _res, next) => {
        const user = req.user;
        if (!user) {
            return next(new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED'));
        }
        // Platform operations have their own explicit routes; tenant APIs always use the actor's scope.
        if (req.user?.isPlatformAdmin &&
            req.baseUrl === '/api/ai-credits' &&
            req.path.startsWith('/admin/'))
            return next();
        if (!user.organizationId)
            return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
        if (!user.campusId)
            return next(new errorHandler_1.ApiError('账号尚未分配校区，请联系管理员', 403, 'CAMPUS_REQUIRED'));
        for (const params of [req.params, req.query, req.body || {}]) {
            if ((params.organizationId && params.organizationId !== user.organizationId) ||
                (user.campusId && params.campusId && params.campusId !== user.campusId)) {
                return next(new errorHandler_1.ApiError('无权访问其他机构或校区', 403, 'FORBIDDEN'));
            }
        }
        // Inject scope on writes for legacy controllers only; GET handlers must scope their query.
        if (req.body && !Array.isArray(req.body) && typeof req.body === 'object') {
            req.body.organizationId = user.organizationId;
            if (user.campusId)
                req.body.campusId = user.campusId;
        }
        next();
    };
};
exports.requireOrganizationAccess = requireOrganizationAccess;
const platformOnly = (req, _res, next) => req.user?.isPlatformAdmin ? next() : next(new errorHandler_1.ApiError('需要平台运营权限', 403, 'FORBIDDEN'));
exports.platformOnly = platformOnly;
//# sourceMappingURL=rbac.js.map