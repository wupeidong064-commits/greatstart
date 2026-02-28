import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { experienceLessonController } from '../controllers/experienceLessonController';

export const experienceLessonRoutes = Router();

experienceLessonRoutes.use(authenticate);
experienceLessonRoutes.use(requireOrganizationAccess());

experienceLessonRoutes.get('/', experienceLessonController.getExperienceLessons);
experienceLessonRoutes.get('/unconverted', experienceLessonController.getUnconverted);
experienceLessonRoutes.get('/stats', experienceLessonController.getTeacherConversionStats);
experienceLessonRoutes.post('/', experienceLessonController.createExperienceLesson);
experienceLessonRoutes.put('/:id', experienceLessonController.updateExperienceLesson);
experienceLessonRoutes.put('/:id/status', experienceLessonController.updateStatus);
experienceLessonRoutes.delete('/:id', experienceLessonController.deleteExperienceLesson);
