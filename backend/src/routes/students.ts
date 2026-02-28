import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { studentController } from '../controllers/studentController';

export const studentRoutes = Router();

// 使用后端 JWT 认证（而非 MemFire token）
studentRoutes.use(authenticate);
studentRoutes.use(requireOrganizationAccess());

studentRoutes.get('/', studentController.getStudents);
studentRoutes.get('/renewal', studentController.getRenewalStudents);
studentRoutes.get('/lost', studentController.getLostStudents);
studentRoutes.get('/low-attendance', studentController.getLowAttendanceStudents);
studentRoutes.get('/continuous-leave', studentController.getContinuousLeaveStudents);
studentRoutes.get('/:id', studentController.getStudentById);
studentRoutes.post('/', studentController.createStudent);
studentRoutes.put('/:id', studentController.updateStudent);
studentRoutes.delete('/:id', studentController.deleteStudent);
studentRoutes.get('/export/excel', studentController.exportStudents);

