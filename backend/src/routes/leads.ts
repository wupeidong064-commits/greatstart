import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { leadController } from '../controllers/leadController';

export const leadRoutes = Router();

leadRoutes.use(authenticate);
leadRoutes.use(requireOrganizationAccess());

leadRoutes.get('/', leadController.getLeads);
leadRoutes.post('/', leadController.createLead);
leadRoutes.put('/:id', leadController.updateLead);
leadRoutes.put('/:id/contact', leadController.updateLastContactTime);
leadRoutes.delete('/:id', leadController.deleteLead);
