import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { scheduleController } from '../controllers/scheduleController';

export const scheduleRoutes = Router();

scheduleRoutes.use(authenticate);
scheduleRoutes.use(requireOrganizationAccess());
scheduleRoutes.use(async (req, _res, next) => {
  try {
    const actor = (req as any).user;
    if (!actor?.organizationId || !actor.campusId) throw new ApiError('未分配校区',403,'FORBIDDEN');
    if (!['admin','manager','teacher','coach'].includes(actor.role)) throw new ApiError('无权查看排课',403,'FORBIDDEN');
    if (req.method !== 'GET' && !['admin','manager'].includes(actor.role)) throw new ApiError('无权修改排课',403,'FORBIDDEN');
    if (req.body.organizationId && req.body.organizationId !== actor.organizationId || req.body.campusId && req.body.campusId !== actor.campusId) throw new ApiError('不能跨校区排课',403,'FORBIDDEN');
    const id = req.path.split('/')[1];
    const groupAction = ['recurring','replace-recurring','cancel-by-class','cancel-future','class-rules'].includes(id);
    const schedule = id && !groupAction ? await prisma.schedule.findUnique({where:{id}}) : null;
    if (id && !groupAction && (!schedule || schedule.organizationId !== actor.organizationId || schedule.campusId !== actor.campusId)) throw new ApiError('排课不属于当前校区',403,'FORBIDDEN');
    if (schedule && ['teacher','coach'].includes(actor.role) && schedule.teacherId !== actor.id) throw new ApiError('只能查看本人授课场次',403,'FORBIDDEN');
    const classId = req.body.classId || (id === 'cancel-by-class' ? req.path.split('/')[2] : null);
    if (classId && !await prisma.class.findFirst({where:{id:classId,organizationId:actor.organizationId,campusId:actor.campusId}})) throw new ApiError('班级不属于当前校区',403,'FORBIDDEN');
    next();
  } catch(e) { next(e); }
});


scheduleRoutes.get('/', scheduleController.getSchedules);
scheduleRoutes.get('/:id/temporary-students', scheduleController.searchTemporaryStudents);
scheduleRoutes.get('/:id/roster', scheduleController.getScheduleRoster);
scheduleRoutes.get('/:id', scheduleController.getScheduleById);
scheduleRoutes.post('/', scheduleController.createSchedule);
scheduleRoutes.post('/recurring', scheduleController.createRecurringSchedules);
scheduleRoutes.post('/replace-recurring', scheduleController.replaceRecurringSchedules);
scheduleRoutes.post('/class-rules/preview', scheduleController.previewFromClassRules);
scheduleRoutes.post('/class-rules/generate', scheduleController.generateFromClassRules);
scheduleRoutes.post('/class-rules/slot-status', scheduleController.setClassRuleSlotStatus);
scheduleRoutes.post('/cancel-by-class/:classId', scheduleController.cancelByClass);
scheduleRoutes.post('/cancel-future', scheduleController.cancelAllFuture);
scheduleRoutes.put('/:id', scheduleController.updateSchedule);
scheduleRoutes.delete('/:id', scheduleController.deleteSchedule);
scheduleRoutes.post('/:id/reschedule', scheduleController.reschedule);

