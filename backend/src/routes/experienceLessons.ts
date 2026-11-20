import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { experienceLessonController } from '../controllers/experienceLessonController';

export const experienceLessonRoutes = Router();

experienceLessonRoutes.use(authenticate);
experienceLessonRoutes.use(requireOrganizationAccess());

experienceLessonRoutes.get('/', experienceLessonController.getExperienceLessons);
experienceLessonRoutes.get('/unconverted', experienceLessonController.getUnconverted);
experienceLessonRoutes.get('/conversion-candidates', experienceLessonController.getConversionCandidates);
experienceLessonRoutes.get('/stats', experienceLessonController.getTeacherConversionStats);
experienceLessonRoutes.get('/available-schedules', experienceLessonController.getAvailableSchedules);
experienceLessonRoutes.get('/:id', experienceLessonController.getExperienceLessonById);
experienceLessonRoutes.post('/', experienceLessonController.createExperienceLesson);
experienceLessonRoutes.put('/:id', experienceLessonController.updateExperienceLesson);
experienceLessonRoutes.put('/:id/status', experienceLessonController.updateStatus);
experienceLessonRoutes.delete('/:id', experienceLessonController.deleteExperienceLesson);
