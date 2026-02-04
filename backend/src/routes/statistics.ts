import { Router } from 'express';
import { authenticateMemFire } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { statisticsController } from '../controllers/statisticsController';

export const statisticsRoutes = Router();

// 使用 MemFire 认证而不是旧的 JWT 认证
statisticsRoutes.use(authenticateMemFire);
statisticsRoutes.use(requireOrganizationAccess());

statisticsRoutes.get('/students', statisticsController.getStudentStatistics);
statisticsRoutes.get('/attendance', statisticsController.getAttendanceStatistics);
statisticsRoutes.get('/courses', statisticsController.getCourseStatistics);
statisticsRoutes.get('/finance', statisticsController.getFinanceStatistics);
statisticsRoutes.get('/dashboard', statisticsController.getDashboard);
statisticsRoutes.get('/weekly-summary', statisticsController.getWeeklySummary);
statisticsRoutes.get('/monthly-summary', statisticsController.getMonthlySummary);
statisticsRoutes.get('/consumption', statisticsController.getConsumptionStatistics);

