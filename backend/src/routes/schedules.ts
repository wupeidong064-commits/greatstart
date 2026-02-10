import { Router } from 'express';
import { authenticateMemFire } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { scheduleController } from '../controllers/scheduleController';

export const scheduleRoutes = Router();

scheduleRoutes.use(authenticateMemFire);
scheduleRoutes.use(requireOrganizationAccess());

scheduleRoutes.get('/', scheduleController.getSchedules);
scheduleRoutes.get('/:id', scheduleController.getScheduleById);
scheduleRoutes.post('/', scheduleController.createSchedule);
scheduleRoutes.post('/recurring', scheduleController.createRecurringSchedules);
scheduleRoutes.put('/:id', scheduleController.updateSchedule);
scheduleRoutes.delete('/:id', scheduleController.deleteSchedule);
scheduleRoutes.post('/:id/reschedule', scheduleController.reschedule);

