import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { attendanceController } from '../controllers/attendanceController';

export const attendanceRoutes = Router();

attendanceRoutes.use(authenticate);
attendanceRoutes.use(requireOrganizationAccess());

attendanceRoutes.get('/', attendanceController.getAttendances);
attendanceRoutes.get('/statistics/summary', attendanceController.getStatistics);
attendanceRoutes.get('/class-attendance-stats', attendanceController.getClassAttendanceStats);
attendanceRoutes.get('/classes', attendanceController.getAllClassesAttendance);
attendanceRoutes.get('/class/:classId', attendanceController.getClassAttendance);
attendanceRoutes.get('/low-attendance-students', attendanceController.getLowAttendanceStudents);
attendanceRoutes.get('/low-attendance-classes', attendanceController.getLowAttendanceClasses);
attendanceRoutes.get('/continuous-leave', attendanceController.getContinuousLeaveStudents);
attendanceRoutes.get('/honeymoon', attendanceController.getHoneymoonAttendance);
attendanceRoutes.get('/:id', attendanceController.getAttendanceById);
attendanceRoutes.post('/', attendanceController.createAttendance);
attendanceRoutes.post('/batch', attendanceController.batchCheckIn);
attendanceRoutes.put('/:id', attendanceController.updateAttendance);
attendanceRoutes.delete('/:id', attendanceController.deleteAttendance);

