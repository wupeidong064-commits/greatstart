/**
 * 批量导入控制器
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const importController: {
    /**
     * 下载导入模板
     * GET /api/import/template/:type
     */
    downloadTemplate: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /**
     * 预览导入数据
     * POST /api/import/preview
     */
    previewImport: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /**
     * 执行导入
     * POST /api/import/execute
     */
    executeImport: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /**
     * 导出失败记录
     * POST /api/import/export-failed
     */
    exportFailedRecords: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=importController.d.ts.map