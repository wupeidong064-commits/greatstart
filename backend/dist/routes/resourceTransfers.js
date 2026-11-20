"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resourceTransferRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const resourceTransferController_1 = require("../controllers/resourceTransferController");
exports.resourceTransferRoutes = (0, express_1.Router)();
exports.resourceTransferRoutes.use(auth_1.authenticate);
exports.resourceTransferRoutes.use((0, rbac_1.requireOrganizationAccess)());
// Active sources with unfinished class responsibilities, and eligible recipients.
exports.resourceTransferRoutes.get('/candidates', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getCandidates);
exports.resourceTransferRoutes.post('/preview', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.previewTransfer);
exports.resourceTransferRoutes.post('/preview-batch', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.previewBatch);
exports.resourceTransferRoutes.post('/execute-batch', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.executeBatch);
exports.resourceTransferRoutes.get('/followup/candidates', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getFollowupCandidates);
exports.resourceTransferRoutes.post('/followup/preview-batch', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.previewFollowupBatch);
exports.resourceTransferRoutes.post('/followup/execute-batch', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.executeFollowupBatch);
exports.resourceTransferRoutes.get('/followup/:userId', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getFollowupResources);
exports.resourceTransferRoutes.post('/followup/execute', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.executeFollowup);
exports.resourceTransferRoutes.get('/dormant/candidates', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getDormantCandidates);
exports.resourceTransferRoutes.post('/dormant/preview-batch', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.previewDormantBatch);
exports.resourceTransferRoutes.post('/dormant/execute-batch', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.executeDormantBatch);
exports.resourceTransferRoutes.get('/dormant/:userId', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getDormantResources);
// 获取老师资源统计（用于交接前预览）
exports.resourceTransferRoutes.get('/teacher-resources/:teacherId', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getTeacherResources);
// 执行资源交接
exports.resourceTransferRoutes.post('/execute', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.executeTransfer);
// 获取交接历史记录
exports.resourceTransferRoutes.get('/history', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getTransferHistory);
// 获取交接详情
exports.resourceTransferRoutes.get('/:id', (0, rbac_1.requireMinRole)('manager'), resourceTransferController_1.resourceTransferController.getTransferById);
//# sourceMappingURL=resourceTransfers.js.map