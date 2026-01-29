import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler';
import prisma from '../config/database';
import { memfireAdmin } from '../config/memfire';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId?: string;
    campusId?: string;
  };
  memfireUser?: {
    id: string;
    email: string;
    role?: string;
    organizationId?: string;
  };
}

// MemFire Token 认证（用于前端使用 MemFire Auth 的情况）
export const authenticateMemFire = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('未提供认证令牌', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);

    // 使用 MemFire Admin API 验证 token
    const { data: { user }, error } = await memfireAdmin.auth.getUser(token);

    if (error || !user) {
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
  res: Response,
  next: NextFunction
) => {
  if (!req.memfireUser) {
    return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
  }

  if (req.memfireUser.role !== 'admin') {
    return next(new ApiError('需要管理员权限', 403, 'FORBIDDEN'));
  }

  next();
};

// 检查 MemFire 用户是否是 admin 或 manager（用于创建工作人员等操作）
export const requireMemFireAdminOrManager = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.memfireUser) {
    return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
  }

  if (req.memfireUser.role !== 'admin' && req.memfireUser.role !== 'manager') {
    return next(new ApiError('需要管理员或管理者权限', 403, 'FORBIDDEN'));
  }

  next();
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('未提供认证令牌', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET未配置');
    }

    const decoded = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: string;
      organizationId?: string;
      campusId?: string;
    };

    // 验证用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        campusId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError('用户不存在或已被禁用', 401, 'UNAUTHORIZED');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId || undefined,
      campusId: user.campusId || undefined,
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

