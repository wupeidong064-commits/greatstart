import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { scheduleController } from '../controllers/scheduleController';

export const scheduleRoutes = Router();

scheduleRoutes.use(authenticate);
scheduleRoutes.use(requireOrganizationAccess());

scheduleRoutes.get('/', scheduleController.getSchedules);
scheduleRoutes.get('/:id', scheduleController.getScheduleById);
scheduleRoutes.post('/', scheduleController.createSchedule);
scheduleRoutes.post('/recurring', scheduleController.createRecurringSchedules);
scheduleRoutes.post('/cancel-by-class/:classId', scheduleController.cancelByClass);
scheduleRoutes.post('/cancel-future', scheduleController.cancelAllFuture);
scheduleRoutes.put('/:id', scheduleController.updateSchedule);
scheduleRoutes.delete('/:id', scheduleController.deleteSchedule);
scheduleRoutes.post('/:id/reschedule', scheduleController.reschedule);

