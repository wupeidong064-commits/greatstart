import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireRole } from '../middleware/rbac';
import { attendanceController } from '../controllers/attendanceController';

export const attendanceRoutes = Router();

attendanceRoutes.use(authenticate);
attendanceRoutes.use(requireOrganizationAccess());
const campusReport = requireRole('admin', 'manager');
const attendanceReader = requireRole('admin', 'manager', 'coach');

attendanceRoutes.get('/', attendanceReader, attendanceController.getAttendances);
attendanceRoutes.get('/statistics/summary', campusReport, attendanceController.getStatistics);
attendanceRoutes.get('/class-attendance-stats', campusReport, attendanceController.getClassAttendanceStats);
attendanceRoutes.get('/classes', campusReport, attendanceController.getClassAttendanceStats);
attendanceRoutes.get('/class/:classId', campusReport, attendanceController.getClassAttendanceStats);
attendanceRoutes.get('/class/:classId/sessions', campusReport, attendanceController.getClassAttendanceSessions);
attendanceRoutes.get('/low-attendance-students', campusReport, attendanceController.getLowAttendanceStudents);
attendanceRoutes.get('/low-attendance-classes', campusReport, attendanceController.getLowAttendanceClasses);
attendanceRoutes.get('/continuous-leave', campusReport, attendanceController.getContinuousLeaveStudents);
attendanceRoutes.get('/honeymoon', campusReport, attendanceController.getHoneymoonAttendance);
attendanceRoutes.get('/:id', attendanceReader, attendanceController.getAttendanceById);
attendanceRoutes.post('/', attendanceController.createAttendance);
attendanceRoutes.post('/batch', attendanceController.batchCheckIn);
attendanceRoutes.put('/:id', attendanceController.updateAttendance);
attendanceRoutes.delete('/:id', attendanceController.deleteAttendance);

