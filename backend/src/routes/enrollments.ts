import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { enrollmentController } from '../controllers/enrollmentController';

export const enrollmentRoutes = Router();

enrollmentRoutes.use(authenticate);
enrollmentRoutes.use(requireOrganizationAccess());

enrollmentRoutes.get('/', enrollmentController.getEnrollments);
enrollmentRoutes.get('/:id', enrollmentController.getEnrollmentById);
enrollmentRoutes.post('/', enrollmentController.createEnrollment);
enrollmentRoutes.post('/transfer', enrollmentController.transferStudent);
enrollmentRoutes.put('/:id', enrollmentController.updateEnrollment);
enrollmentRoutes.delete('/:id', enrollmentController.deleteEnrollment);

