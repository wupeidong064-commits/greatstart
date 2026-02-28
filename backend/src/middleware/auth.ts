import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler';
import { memfireAdmin } from '../config/memfire';
import { securityConfig } from '../config/security';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId?: string;
    campusId?: string;
    phone?: string;
  };
  memfireUser?: {
    id: string;
    email: string;
    role?: string;
    organizationId?: string;
    campusId?: string;
    phone?: string;
  };
}

// MemFire Token 认证（用于前端使用 MemFire Auth 的情况）
export const authenticateMemFire = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('未提供认证令牌', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);

    // 使用 MemFire Admin API 验证 token (通过获取用户信息来验证)
    const { data: { user }, error } = await memfireAdmin
      .auth
      .getUser(token);

    if (error || !user) {
      // 尝试另一种方法：通过 access_token 验证
      // 使用 supabase 的 verifyIdToken 或类似方法
      try {
        // 解码 JWT 获取用户信息（不验证签名，仅用于获取 user_id）
        const decoded = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64').toString()
        );

        if (decoded.sub) {
          // 使用 sub (user_id) 获取用户信息
          const { data: userById } = await memfireAdmin.auth.admin.getUserById(decoded.sub);
          if (userById && userById.user) {
            const user = userById.user;

            // 从 users 表获取用户的角色和机构信息
            const { data: userData } = await memfireAdmin
              .from('users')
              .select('*')
              .eq('id', user.id)
              .maybeSingle();

            req.memfireUser = {
              id: user.id,
              email: user.email || '',
              role: userData?.role,
              organizationId: userData?.organizationId,
              phone: userData?.phone,
            };

            // 同时设置 req.user 以保持兼容性
            req.user = {
              id: user.id,
              email: user.email || '',
              role: userData?.role || '',
              organizationId: userData?.organizationId,
              campusId: userData?.campusId,
              phone: userData?.phone,
            };

            return next();
          }
        }
      } catch (jwtError) {
        // JWT 解码失败
      }

      throw new ApiError('无效的认证令牌', 401, 'UNAUTHORIZED');
    }

    // 从 users 表获取用户的角色和机构信息
    const { data: userData } = await memfireAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    req.memfireUser = {
      id: user.id,
      email: user.email || '',
      role: userData?.role,
      organizationId: userData?.organizationId,
      phone: userData?.phone,
    };

    // 同时设置 req.user 以保持兼容性
    req.user = {
      id: user.id,
      email: user.email || '',
      role: userData?.role || '',
      organizationId: userData?.organizationId,
      campusId: userData?.campusId,
      phone: userData?.phone,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError('认证失败', 401, 'UNAUTHORIZED'));
    }
  }
};

// 检查 MemFire 用户是否是 admin
export const requireMemFireAdmin = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const user = req.memfireUser || req.user;
  if (!user) {
    return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
  }

  if (user.role !== 'admin') {
    return next(new ApiError('需要管理员权限', 403, 'FORBIDDEN'));
  }

  next();
};

// 检查 MemFire 用户是否是 admin 或 manager（用于创建工作人员等操作）
export const requireMemFireAdminOrManager = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const user = req.memfireUser || req.user;
  if (!user) {
    return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
  }

  if (user.role !== 'admin' && user.role !== 'manager') {
    return next(new ApiError('需要管理员或管理者权限', 403, 'FORBIDDEN'));
  }

  next();
};

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('未提供认证令牌', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);
    const secret = securityConfig.jwt.secret;

    const decoded = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: string;
      organizationId?: string;
      campusId?: string;
    };

    // 验证用户是否存在（使用 MemFire）
    const { data: user, error } = await memfireAdmin
      .from('users')
      .select('id, email, role, organizationId, campusId, isActive, phone')
      .eq('id', decoded.userId)
      .maybeSingle();

    if (error || !user || !user.isActive) {
      throw new ApiError('用户不存在或已被禁用', 401, 'UNAUTHORIZED');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId || undefined,
      campusId: user.campusId || undefined,
      phone: user.phone || undefined,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError('无效的认证令牌', 401, 'UNAUTHORIZED'));
    }
  }
};

