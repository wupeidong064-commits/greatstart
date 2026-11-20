import type { Response, NextFunction } from 'express';
import { authenticate, type AuthRequest } from './auth';
import { ApiError } from './errorHandler';
import { authenticateIntegrationKey } from '../services/integrationKeyService';
import { resolveDefaultCampus } from '../services/organizationScope';
import prisma from '../config/database';

export async function authenticateIntegration(req: AuthRequest, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer bzsk_')) {
    try { req.user = await authenticateIntegrationKey(header.slice(7)); next(); } catch (e) { next(e); }
    return;
  }
  // Keep developer JWT access, with the same current manager and institution boundary.
  await authenticate(req, res, async e => {
    if (e) return next(e);
    try {
      const u = req.user!;
      if (!u.organizationId || !(u.isPlatformAdmin || ['super', 'manager'].includes(u.managementLevel || '')))
        throw new ApiError('只有机构管理员可以接入机构数据', 403, 'FORBIDDEN');
      const campus = await resolveDefaultCampus(prisma, u.organizationId);
      if (u.campusId !== campus.id) throw new ApiError('账号机构范围异常', 403, 'FORBIDDEN');
      next();
    } catch (error) { next(error); }
  });
}
