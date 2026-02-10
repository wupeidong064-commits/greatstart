import { Router } from 'express';
import { authenticateMemFire } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { organizationController } from '../controllers/organizationController';

export const organizationRoutes = Router();

organizationRoutes.use(authenticateMemFire);

organizationRoutes.get('/', requireRole('admin'), organizationController.getOrganizations);
organizationRoutes.get('/:id', organizationController.getOrganizationById);
organizationRoutes.post('/', requireRole('admin'), organizationController.createOrganization);
organizationRoutes.put('/:id', requireRole('admin'), organizationController.updateOrganization);
organizationRoutes.delete('/:id', requireRole('admin'), organizationController.deleteOrganization);

