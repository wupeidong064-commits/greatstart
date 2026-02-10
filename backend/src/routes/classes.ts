import { Router } from 'express';
import { authenticateMemFire } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { classController } from '../controllers/classController';

export const classRoutes = Router();

classRoutes.use(authenticateMemFire);
classRoutes.use(requireOrganizationAccess());

classRoutes.get('/', classController.getClasses);
classRoutes.get('/experience-priority', classController.getExperiencePriorityClasses);
classRoutes.get('/:id', classController.getClassById);
classRoutes.post('/', classController.createClass);
classRoutes.put('/:id', classController.updateClass);
classRoutes.delete('/:id', classController.deleteClass);

