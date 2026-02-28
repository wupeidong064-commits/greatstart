import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { statisticsController } from '../controllers/statisticsController';

export const statisticsRoutes = Router();

// 使用 JWT 认证
statisticsRoutes.use(authenticate);
statisticsRoutes.use(requireOrganizationAccess());

statisticsRoutes.get('/students', statisticsController.getStudentStatistics);
statisticsRoutes.get('/attendance', statisticsController.getAttendanceStatistics);
statisticsRoutes.get('/courses', statisticsController.getCourseStatistics);
statisticsRoutes.get('/finance', statisticsController.getFinanceStatistics);
statisticsRoutes.get('/dashboard', statisticsController.getDashboard);
statisticsRoutes.get('/weekly-summary', statisticsController.getWeeklySummary);
statisticsRoutes.get('/monthly-summary', statisticsController.getMonthlySummary);
statisticsRoutes.get('/consumption', statisticsController.getConsumptionStatistics);

