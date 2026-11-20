import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireRole } from '../middleware/rbac';
import { consumptionController } from '../controllers/consumptionController';

export const consumptionRoutes = Router();

consumptionRoutes.use(authenticate);
consumptionRoutes.use(requireOrganizationAccess());
consumptionRoutes.use(requireRole('manager', 'admin'));

// 获取消耗统计
consumptionRoutes.get('/statistics', consumptionController.getStatistics);

// 获取班级学员变动
consumptionRoutes.get('/class-student-changes', consumptionController.getClassStudentChanges);
