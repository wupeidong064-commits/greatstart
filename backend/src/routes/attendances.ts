import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { attendanceController } from '../controllers/attendanceController';

export const attendanceRoutes = Router();

attendanceRoutes.use(authenticate);
attendanceRoutes.use(requireOrganizationAccess());

attendanceRoutes.get('/', attendanceController.getAttendances);
attendanceRoutes.get('/:id', attendanceController.getAttendanceById);
attendanceRoutes.post('/', attendanceController.createAttendance);
attendanceRoutes.post('/batch', attendanceController.batchCheckIn);
attendanceRoutes.put('/:id', attendanceController.updateAttendance);
attendanceRoutes.delete('/:id', attendanceController.deleteAttendance);
attendanceRoutes.get('/statistics/summary', attendanceController.getStatistics);
attendanceRoutes.get('/classes', attendanceController.getAllClassesAttendance);
attendanceRoutes.get('/class/:classId', attendanceController.getClassAttendance);
attendanceRoutes.get('/continuous-leave', attendanceController.getContinuousLeaveStudents);
attendanceRoutes.get('/honeymoon', attendanceController.getHoneymoonAttendance);
attendanceRoutes.get('/low-attendance-classes', attendanceController.getLowAttendanceClasses);

