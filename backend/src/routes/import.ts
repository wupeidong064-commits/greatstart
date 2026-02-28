/**
 * 批量导入路由
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { importController } from '../controllers/importController';

export const importRoutes = Router();

// 配置 multer 用于文件上传（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    // 只接受 Excel 文件
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 Excel 文件格式（.xlsx 或 .xls）'));
    }
  },
});

// 使用认证中间件
importRoutes.use(authenticate);
importRoutes.use(requireOrganizationAccess());

// 下载模板
importRoutes.get('/template/:type', importController.downloadTemplate);

// 预览导入数据
importRoutes.post('/preview', upload.single('file'), importController.previewImport);

// 执行导入
importRoutes.post('/execute', importController.executeImport);

// 导出失败记录
importRoutes.post('/export-failed', importController.exportFailedRecords);
