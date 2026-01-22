import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { studentController } from '../controllers/studentController';

export const studentRoutes = Router();

studentRoutes.use(authenticate);
studentRoutes.use(requireOrganizationAccess());

studentRoutes.get('/', studentController.getStudents);
studentRoutes.get('/renewal', studentController.getRenewalStudents);
studentRoutes.get('/renewal/export', studentController.exportRenewalStudents);
studentRoutes.get('/lost', studentController.getLostStudents);
studentRoutes.get('/:id', studentController.getStudentById);
studentRoutes.post('/', studentController.createStudent);
studentRoutes.put('/:id', studentController.updateStudent);
studentRoutes.put('/:id/lost-info', studentController.updateLostStudentInfo);
studentRoutes.delete('/:id', studentController.deleteStudent);
studentRoutes.post('/import', studentController.importStudents);
studentRoutes.get('/export/excel', studentController.exportStudents);

