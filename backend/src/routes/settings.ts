import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMinRole, requireOrganizationAccess } from '../middleware/rbac';
import { settingsController } from '../controllers/settingsController';

export const settingsRoutes = Router();

settingsRoutes.use(authenticate);
settingsRoutes.use(requireOrganizationAccess());

// 获取设置项
settingsRoutes.get('/:key', settingsController.getSetting);

// 更新设置项
settingsRoutes.put('/:key', requireMinRole('manager'), settingsController.updateSetting);
