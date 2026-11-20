import { Router } from 'express';
import { platformOnly } from '../middleware/rbac';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { changeManagement, staffUser } from '../services/managementAccess';
import prisma from '../config/database';
import { userFields } from '../services/managedUsers';
import { sendSuccess } from '../utils/response';
import type { AuthRequest } from '../middleware/auth';
import { organizationController } from '../controllers/organizationController';

export const organizationRoutes = Router();

organizationRoutes.use(authenticate);

// Admin 和 Manager 都可以获取机构列表（Manager 只能看到自己的）
organizationRoutes.get('/', organizationController.getOrganizations);
organizationRoutes.get('/:id/administrators', platformOnly, async (req, res, next) => {
  try { sendSuccess(res, (await prisma.user.findMany({ where: { organizationId: req.params.id, isPlatformAdmin: false, role: { not: 'parent' } }, select: userFields, orderBy: [{ name: 'asc' }, { id: 'asc' }] })).map(staffUser)); }
  catch (e) { next(e); }
});
organizationRoutes.put('/:id/administrators/:userId', platformOnly, async (req: AuthRequest, res, next) => {
  try { sendSuccess(res, await changeManagement(req.user!, req.params.id, req.params.userId, req.body.managementLevel, req.body.expectedLevel), '管理任命已更新'); }
  catch (e) { next(e); }
});
organizationRoutes.get('/:id', organizationController.getOrganizationById);
organizationRoutes.post('/', platformOnly, organizationController.createOrganization);
organizationRoutes.put('/:id', platformOnly, organizationController.updateOrganization);
organizationRoutes.delete('/:id', platformOnly, organizationController.deleteOrganization);

