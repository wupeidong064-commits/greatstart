import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireMinRole } from '../middleware/rbac';
import { resourceTransferController } from '../controllers/resourceTransferController';

export const resourceTransferRoutes = Router();

resourceTransferRoutes.use(authenticate);
resourceTransferRoutes.use(requireOrganizationAccess());

// 获取教练资源统计（用于交接前预览）
resourceTransferRoutes.get('/teacher-resources/:teacherId',
  requireMinRole('manager'),
  resourceTransferController.getTeacherResources
);

// 执行资源交接
resourceTransferRoutes.post('/execute',
  requireMinRole('manager'),
  resourceTransferController.executeTransfer
);

// 获取交接历史记录
resourceTransferRoutes.get('/history',
  requireMinRole('manager'),
  resourceTransferController.getTransferHistory
);

// 获取交接详情
resourceTransferRoutes.get('/:id',
  requireMinRole('manager'),
  resourceTransferController.getTransferById
);
