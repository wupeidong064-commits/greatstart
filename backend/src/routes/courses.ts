import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { courseController } from '../controllers/courseController';

export const courseRoutes = Router();

courseRoutes.use(authenticate);
courseRoutes.use(requireOrganizationAccess());

courseRoutes.get('/', courseController.getCourses);
courseRoutes.get('/:id', courseController.getCourseById);
courseRoutes.post('/', courseController.createCourse);
courseRoutes.put('/:id', courseController.updateCourse);
courseRoutes.delete('/:id', courseController.deleteCourse);

