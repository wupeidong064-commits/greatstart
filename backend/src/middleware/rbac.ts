import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ApiError } from './errorHandler';

export type Role = 'admin' | 'manager' | 'teacher' | 'coach' | 'sales' | 'staff' | 'parent';

const roleHierarchy: Record<Role, number> = {
  admin: 5,
  manager: 4,
  teacher: 3,
  coach: 3,
  sales: 3,
  staff: 2,
  parent: 1,
};

const roleMapping: Record<string, Role> = {
  'teacher': 'coach',
};

export const normalizeRole = (role: string): Role => {
  return roleMapping[role] || (role as Role);
};

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // 支持 req.user（旧认证）和 req.memfireUser（MemFire 认证）
    const user = req.user || req.memfireUser;
    if (!user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    const normalizedRole = normalizeRole(user.role);
    if (!allowedRoles.includes(normalizedRole)) {
      return next(
        new ApiError('权限不足', 403, 'FORBIDDEN')
      );
    }

    next();
  };
};

export const requireMinRole = (minRole: Role) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // 支持 req.user（旧认证）和 req.memfireUser（MemFire 认证）
    const user = req.user || req.memfireUser;
    if (!user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    const normalizedRole = normalizeRole(user.role);
    const userRoleLevel = roleHierarchy[normalizedRole] || 0;
    const minRoleLevel = roleHierarchy[minRole];

    if (userRoleLevel < minRoleLevel) {
      return next(new ApiError('权限不足', 403, 'FORBIDDEN'));
    }

    next();
  };
};

// 数据隔离中间件：确保用户只能访问自己机构/校区的数据
export const requireOrganizationAccess = () => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 支持 req.user（旧认证）和 req.memfireUser（MemFire 认证）
    const user = req.user || req.memfireUser;
    if (!user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    const normalizedRole = normalizeRole(user.role);

    // 所有 admin 角色可以访问所有数据
    if (normalizedRole === 'admin') {
      return next();
    }

    // 其他角色必须有organizationId
    if (!user.organizationId) {
      return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
    }

    // 从请求参数或body中获取organizationId
    const requestedOrgId = req.params.organizationId || req.body.organizationId;
    if (requestedOrgId && requestedOrgId !== user.organizationId) {
      return next(new ApiError('无权访问该机构数据', 403, 'FORBIDDEN'));
    }

    // 自动设置organizationId到请求中
    req.body.organizationId = user.organizationId;
    if (user.campusId) {
      req.body.campusId = user.campusId;
    }

    next();
  };
};

