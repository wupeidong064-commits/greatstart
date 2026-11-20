import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMinRole, requireOrganizationAccess } from '../middleware/rbac';
import { courseController } from '../controllers/courseController';

export const courseRoutes = Router();

courseRoutes.use(authenticate);
courseRoutes.use(requireOrganizationAccess());

courseRoutes.get('/', courseController.getCourses);
courseRoutes.get('/:id', courseController.getCourseById);
courseRoutes.post('/', requireMinRole('manager'), courseController.createCourse);
courseRoutes.put('/:id', requireMinRole('manager'), courseController.updateCourse);
courseRoutes.delete('/:id', requireMinRole('manager'), courseController.deleteCourse);

