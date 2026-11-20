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
  teacher: 'coach',
};

export const normalizeRole = (role: string): Role => {
  return roleMapping[role] || (role as Role);
};

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    const normalizedRole = normalizeRole(user.role || '');
    if (!allowedRoles.includes(normalizedRole)) {
      return next(new ApiError('权限不足', 403, 'FORBIDDEN'));
    }

    next();
  };
};

export const requireMinRole = (minRole: Role) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    const normalizedRole = normalizeRole(user.role || '');
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
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
    }

    // Platform operations have their own explicit routes; tenant APIs always use the actor's scope.
    if (
      req.user?.isPlatformAdmin &&
      req.baseUrl === '/api/ai-credits' &&
      req.path.startsWith('/admin/')
    )
      return next();
    if (!user.organizationId) return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
    if (!user.campusId)
      return next(new ApiError('账号尚未分配校区，请联系管理员', 403, 'CAMPUS_REQUIRED'));
    for (const params of [req.params, req.query, req.body || {}]) {
      if (
        (params.organizationId && params.organizationId !== user.organizationId) ||
        (user.campusId && params.campusId && params.campusId !== user.campusId)
      ) {
        return next(new ApiError('无权访问其他机构或校区', 403, 'FORBIDDEN'));
      }
    }
    // Inject scope on writes for legacy controllers only; GET handlers must scope their query.
    if (req.body && !Array.isArray(req.body) && typeof req.body === 'object') {
      req.body.organizationId = user.organizationId;
      if (user.campusId) req.body.campusId = user.campusId;
    }
    next();
  };
};

export const platformOnly = (req: AuthRequest, _res: Response, next: NextFunction) =>
  req.user?.isPlatformAdmin ? next() : next(new ApiError('需要平台运营权限', 403, 'FORBIDDEN'));
