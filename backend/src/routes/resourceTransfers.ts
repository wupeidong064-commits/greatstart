import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireMinRole } from '../middleware/rbac';
import { resourceTransferController } from '../controllers/resourceTransferController';

export const resourceTransferRoutes = Router();

resourceTransferRoutes.use(authenticate);
resourceTransferRoutes.use(requireOrganizationAccess());

// Active sources with unfinished class responsibilities, and eligible recipients.
resourceTransferRoutes.get('/candidates', requireMinRole('manager'), resourceTransferController.getCandidates);
resourceTransferRoutes.post('/preview', requireMinRole('manager'), resourceTransferController.previewTransfer);
resourceTransferRoutes.post('/preview-batch', requireMinRole('manager'), resourceTransferController.previewBatch);
resourceTransferRoutes.post('/execute-batch', requireMinRole('manager'), resourceTransferController.executeBatch);

resourceTransferRoutes.get('/followup/candidates', requireMinRole('manager'), resourceTransferController.getFollowupCandidates);
resourceTransferRoutes.post('/followup/preview-batch', requireMinRole('manager'), resourceTransferController.previewFollowupBatch);
resourceTransferRoutes.post('/followup/execute-batch', requireMinRole('manager'), resourceTransferController.executeFollowupBatch);
resourceTransferRoutes.get('/followup/:userId', requireMinRole('manager'), resourceTransferController.getFollowupResources);
resourceTransferRoutes.post('/followup/execute', requireMinRole('manager'), resourceTransferController.executeFollowup);

resourceTransferRoutes.get('/dormant/candidates', requireMinRole('manager'), resourceTransferController.getDormantCandidates);
resourceTransferRoutes.post('/dormant/preview-batch', requireMinRole('manager'), resourceTransferController.previewDormantBatch);
resourceTransferRoutes.post('/dormant/execute-batch', requireMinRole('manager'), resourceTransferController.executeDormantBatch);
resourceTransferRoutes.get('/dormant/:userId', requireMinRole('manager'), resourceTransferController.getDormantResources);

// 获取老师资源统计（用于交接前预览）
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
