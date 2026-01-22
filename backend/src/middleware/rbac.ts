import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ApiError } from './errorHandler';

export type Role = 'admin' | 'manager' | 'teacher' | 'staff' | 'parent';

const roleHierarchy: Record<Role, number> = {
  admin: 5,
  manager: 4,
  teacher: 3,
  staff: 2,
  parent: 1,
};

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      return next(
        new ApiError('权限不足', 403, 'FORBIDDEN')
      );
    }

    next();
  };
};

export const requireMinRole = (minRole: Role) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    const userRoleLevel = roleHierarchy[req.user.role as Role] || 0;
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
    if (!req.user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    // 系统管理员可以访问所有数据
    if (req.user.role === 'admin') {
      return next();
    }

    // 其他角色必须有organizationId
    if (!req.user.organizationId) {
      return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
    }

    // 从请求参数或body中获取organizationId
    const requestedOrgId = req.params.organizationId || req.body.organizationId;
    if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
      return next(new ApiError('无权访问该机构数据', 403, 'FORBIDDEN'));
    }

    // 自动设置organizationId到请求中
    req.body.organizationId = req.user.organizationId;
    if (req.user.campusId) {
      req.body.campusId = req.user.campusId;
    }

    next();
  };
};

