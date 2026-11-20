import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { changeIntegrationKey, integrationKeyStatus } from '../services/integrationKeyService';
import { resolveDefaultCampus } from '../services/organizationScope';
import prisma from '../config/database';
import { logger } from '../middleware/logger';

export const integrationKeyRoutes = Router();
integrationKeyRoutes.use(authenticate, requireMinRole('manager'));
integrationKeyRoutes.use(async (req: AuthRequest, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!req.user?.organizationId) throw new ApiError('未分配机构', 403, 'FORBIDDEN');
    const campus = await resolveDefaultCampus(prisma, req.user.organizationId);
    if (req.user.campusId !== campus.id) throw new ApiError('账号机构范围异常', 403, 'FORBIDDEN');
    next();
  } catch (e) { next(e); }
});
integrationKeyRoutes.get('/', async (req: AuthRequest, res, next) => {
  try { sendSuccess(res, await integrationKeyStatus(req.user!.organizationId!)); } catch (e) { next(e); }
});
for (const method of ['post', 'delete'] as const) {
  integrationKeyRoutes[method]('/', async (req: AuthRequest, res, next) => {
    try {
      const parsed = z.object({ expectedRevision: z.string().uuid().nullable() }).strict().safeParse(req.body);
      if (!parsed.success) throw new ApiError('接入配置版本无效，请刷新后再操作', 400, 'INVALID_REVISION');
      const result = await changeIntegrationKey(req.user!, parsed.data.expectedRevision, method === 'delete');
      logger.audit(method === 'post' ? 'integration-key-generated' : 'integration-key-revoked',
        { organizationId: req.user!.organizationId, actorId: req.user!.id });
      sendSuccess(res, result);
    } catch (e) { next(e); }
  });
}
