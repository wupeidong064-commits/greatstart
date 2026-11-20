import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler';
import prisma from '../config/database';
import { effectiveRole, jobRole } from '../services/managementAccess';
import { createHash, createHmac } from 'crypto';
import { securityConfig } from '../config/security';

export interface AuthRequest extends Request {
  authSession?: { tokenHash: string; expiresAt: Date };
  user?: {
    id: string;
    email: string | null;
    role: string;
    organizationId?: string;
    campusId?: string;
    phone?: string;
    isPlatformAdmin?: boolean;
    managementLevel?: string;
    jobRole?: string | null;
  };
}

export const sessionTag = (passwordHash: string) =>
  createHmac('sha256', securityConfig.jwt.secret).update(passwordHash).digest('base64url');

export const authenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('未提供认证令牌', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);
    const secret = securityConfig.jwt.secret;

    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as {
      userId: string;
      sessionTag?: string;
      exp?: number;
      email: string;
      role: string;
      organizationId?: string;
      campusId?: string;
    };

    // 验证用户是否存在（Prisma 直查本库）
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        campusId: true,
        isActive: true,
        password: true,
        organization: { select: { isActive: true } },
        campus: { select: { isActive: true, organizationId: true } },
        phone: true,
        isPlatformAdmin: true,
        managementLevel: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError('用户不存在或已被禁用', 401, 'UNAUTHORIZED');
    }

    if (decoded.sessionTag !== sessionTag(user.password))
      throw new ApiError('请重新登录', 401, 'SESSION_EXPIRED');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    if (await prisma.revokedAuthSession.findUnique({ where: { tokenHash }, select: { tokenHash: true } }))
      throw new ApiError('当前会话已退出，请重新登录', 401, 'SESSION_EXPIRED');
    if (decoded.exp !== undefined) req.authSession = { tokenHash, expiresAt: new Date(decoded.exp * 1000) };
    if (
      !user.isPlatformAdmin &&
      (user.organization?.isActive === false ||
        user.campus?.isActive === false ||
        (user.campus && user.campus.organizationId !== user.organizationId))
    )
      throw new ApiError('机构或校区不可用', 403, 'FORBIDDEN');
    const path = req.baseUrl.toLowerCase();
    if (
      user.role === 'parent' &&
      !(
        path === '/api/parent' ||
        path === '/api/auth' ||
        (path === '/api/organizations' &&
          req.method === 'GET' &&
          req.path === '/' + user.organizationId)
      )
    ) {
      throw new ApiError('家长账号无权访问该资源', 403, 'FORBIDDEN');
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: effectiveRole(user),
      jobRole: jobRole(user),
      managementLevel: user.managementLevel,
      organizationId: user.organizationId || undefined,
      campusId: user.campusId || undefined,
      phone: user.phone || undefined,
      isPlatformAdmin: user.isPlatformAdmin === true,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      if (error instanceof jwt.JsonWebTokenError)
        return next(new ApiError('请重新登录', 401, 'UNAUTHORIZED'));
      next(new ApiError('无法验证账号状态，请稍后重试', 503, 'AUTH_UNAVAILABLE'));
    }
  }
};
