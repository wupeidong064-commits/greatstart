import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { organizationController } from '../controllers/organizationController';

export const organizationRoutes = Router();

organizationRoutes.use(authenticate);

// Admin 和 Manager 都可以获取机构列表（Manager 只能看到自己的）
organizationRoutes.get('/', organizationController.getOrganizations);
organizationRoutes.get('/:id', organizationController.getOrganizationById);
organizationRoutes.post('/', requireRole('admin'), organizationController.createOrganization);
organizationRoutes.put('/:id', requireRole('admin'), organizationController.updateOrganization);
organizationRoutes.delete('/:id', requireRole('admin'), organizationController.deleteOrganization);

