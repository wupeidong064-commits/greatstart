import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { campusController } from '../controllers/campusController';

export const campusRoutes = Router();

campusRoutes.use(authenticate);

campusRoutes.get('/', campusController.getCampuses);
campusRoutes.get('/:id', campusController.getCampusById);
campusRoutes.post('/', requireMinRole('manager'), campusController.createCampus);
campusRoutes.put('/:id', requireMinRole('manager'), campusController.updateCampus);
campusRoutes.delete('/:id', requireMinRole('manager'), campusController.deleteCampus);

