import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireRole } from '../middleware/rbac';
import { cashflowSummaryController } from '../controllers/cashflowSummaryController';

export const cashflowSummaryRoutes = Router();

cashflowSummaryRoutes.use(authenticate);
cashflowSummaryRoutes.use(requireOrganizationAccess());
cashflowSummaryRoutes.use(requireRole('manager', 'admin'));

// 获取现金流总结
cashflowSummaryRoutes.get('/', cashflowSummaryController.getSummary);
