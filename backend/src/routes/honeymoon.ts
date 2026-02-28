import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { honeymoonController } from '../controllers/honeymoonController';

export const honeymoonRoutes = Router();

honeymoonRoutes.use(authenticate);
honeymoonRoutes.use(requireOrganizationAccess());

// 获取蜜月期学员
honeymoonRoutes.get('/students', honeymoonController.getHoneymoonStudents);
