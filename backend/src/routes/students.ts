import {attendanceController} from '../controllers/attendanceController';
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireMinRole } from '../middleware/rbac';
import { studentController } from '../controllers/studentController';

export const studentRoutes = Router();

// 使用后端 JWT 认证
studentRoutes.use(authenticate);
studentRoutes.use(requireOrganizationAccess());

studentRoutes.get('/', studentController.getStudents);
studentRoutes.get('/renewal', studentController.getStudents);
studentRoutes.get('/lost', studentController.getStudents);
studentRoutes.get('/low-attendance', requireMinRole('manager'), attendanceController.getLowAttendanceStudents);
studentRoutes.get('/continuous-leave', requireMinRole('manager'), attendanceController.getContinuousLeaveStudents);
studentRoutes.get('/:id', studentController.getStudentById);
// 安全修复：学员档案写入需 staff 及以上角色（此前家长角色也能创建，真实联调发现）
studentRoutes.post('/', requireMinRole('staff'), studentController.createStudent);
studentRoutes.post('/:id/archive', requireMinRole('manager'), studentController.archiveStudent);
studentRoutes.post('/:id/restore', requireMinRole('manager'), studentController.restoreStudent);
studentRoutes.put('/:id', requireMinRole('staff'), studentController.updateStudent);
studentRoutes.delete('/:id', requireMinRole('manager'), studentController.deleteStudent);
// The legacy full-roster export is not a public endpoint.

