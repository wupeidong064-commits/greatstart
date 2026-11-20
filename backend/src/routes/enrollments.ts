import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireRole } from '../middleware/rbac';
import { enrollmentController } from '../controllers/enrollmentController';

export const enrollmentRoutes = Router();

enrollmentRoutes.use(authenticate);
enrollmentRoutes.use(requireOrganizationAccess());

enrollmentRoutes.get('/', enrollmentController.getEnrollments);
enrollmentRoutes.get('/:id', enrollmentController.getEnrollmentById);
enrollmentRoutes.post('/', enrollmentController.createEnrollment);
enrollmentRoutes.post('/transfer', enrollmentController.transferStudent);
enrollmentRoutes.post('/:id/remove-as-lost', requireRole('admin','manager','coach'), enrollmentController.removeAsLost);
enrollmentRoutes.put('/:id', requireRole('admin','manager'), enrollmentController.updateEnrollment);
enrollmentRoutes.delete('/:id', requireRole('admin','manager'), enrollmentController.deleteEnrollment);

