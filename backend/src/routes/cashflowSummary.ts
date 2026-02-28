import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { cashflowSummaryController } from '../controllers/cashflowSummaryController';

export const cashflowSummaryRoutes = Router();

cashflowSummaryRoutes.use(authenticate);
cashflowSummaryRoutes.use(requireOrganizationAccess());

// 获取现金流总结
cashflowSummaryRoutes.get('/', cashflowSummaryController.getSummary);
