import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMinRole, requireOrganizationAccess } from '../middleware/rbac';
import { classController } from '../controllers/classController';

export const classRoutes = Router();

classRoutes.use(authenticate);
classRoutes.use(requireOrganizationAccess());

classRoutes.get('/', classController.getClasses);
classRoutes.get('/experience-priority', classController.getExperiencePriorityClasses);
classRoutes.get('/:id', classController.getClassById);
classRoutes.get('/:id/students', classController.getClassStudents);
classRoutes.post('/', requireMinRole('manager'), classController.createClass);
classRoutes.put('/:id', requireMinRole('manager'), classController.updateClass);
classRoutes.delete('/:id', requireMinRole('manager'), classController.deleteClass);

