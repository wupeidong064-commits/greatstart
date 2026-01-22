import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { classController } from '../controllers/classController';

export const classRoutes = Router();

classRoutes.use(authenticate);
classRoutes.use(requireOrganizationAccess());

classRoutes.get('/', classController.getClasses);
classRoutes.get('/experience-priority', classController.getExperiencePriorityClasses);
classRoutes.get('/:id', classController.getClassById);
classRoutes.post('/', classController.createClass);
classRoutes.put('/:id', classController.updateClass);
classRoutes.delete('/:id', classController.deleteClass);

