/**
 * 批量导入控制器
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { importService, ImportType, DuplicateStrategy, DuplicateItem } from '../services/importService';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

// 文件大小限制：5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 允许的文件类型
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

export const importController = {
  /**
   * 下载导入模板
   * GET /api/import/template/:type
   */
  downloadTemplate: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { type } = req.params;

      const validTypes = ['students', 'classes', 'leads', 'experiences'];
      if (!validTypes.includes(type)) {
        return next(new ApiError('无效的模板类型', 400, 'INVALID_TEMPLATE_TYPE'));
      }

      let buffer: Buffer;
      let filename: string;

      switch (type) {
        case 'students':
          buffer = importService.generateStudentTemplate();
          filename = '学员导入模板.xlsx';
          break;
        case 'classes':
          buffer = importService.generateClassTemplate();
          filename = '班级导入模板.xlsx';
          break;
        case 'leads':
          buffer = importService.generateLeadTemplate();
          filename = '鱼池导入模板.xlsx';
          break;
        case 'experiences':
          buffer = importService.generateExperienceTemplate();
          filename = '体验课导入模板.xlsx';
          break;
        default:
          return next(new ApiError('无效的模板类型', 400, 'INVALID_TEMPLATE_TYPE'));
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  /**
   * 预览导入数据
   * POST /api/import/preview
   */
  previewImport: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const organizationId = currentUser?.organizationId;
      const campusId = currentUser?.campusId;

      if (!organizationId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const { type } = req.body;
      const file = req.file;

      if (!file) {
        return next(new ApiError('请上传文件', 400, 'FILE_REQUIRED'));
      }

      const validTypes = ['students', 'classes', 'leads', 'experiences'];
      if (!validTypes.includes(type)) {
        return next(new ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
      }

      // 验证文件类型
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype || '')) {
        return next(new ApiError('文件格式不支持，请上传 Excel 文件（.xlsx 或 .xls）', 400, 'INVALID_FILE_TYPE'));
      }

      // 验证文件大小
      if (file.size > MAX_FILE_SIZE) {
        return next(new ApiError('文件大小不能超过 5MB', 400, 'FILE_TOO_LARGE'));
      }

      let previewResult;
      switch (type) {
        case 'students':
          previewResult = await importService.previewStudents(file.buffer, organizationId, campusId);
          break;
        case 'classes':
          previewResult = await importService.previewClasses(file.buffer, organizationId, campusId);
          break;
        case 'leads':
          previewResult = await importService.previewLeads(file.buffer, organizationId);
          break;
        case 'experiences':
          previewResult = await importService.previewExperiences(file.buffer, organizationId);
          break;
        default:
          return next(new ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
      }

      sendSuccess(res, previewResult);
    } catch (error: any) {
      if (error.message?.includes('Excel')) {
        return next(new ApiError(error.message, 400, 'PARSE_ERROR'));
      }
      next(error);
    }
  },

  /**
   * 执行导入
   * POST /api/import/execute
   */
  executeImport: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const organizationId = currentUser?.organizationId;
      const campusId = currentUser?.campusId;

      if (!organizationId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const {
        type,
        data,
        duplicateStrategy,
        createMissingClasses,
        duplicates,
      } = req.body;

      const validTypes = ['students', 'classes', 'leads', 'experiences'];
      if (!validTypes.includes(type)) {
        return next(new ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return next(new ApiError('导入数据不能为空', 400, 'DATA_REQUIRED'));
      }

      if (!['skip', 'update'].includes(duplicateStrategy)) {
        return next(new ApiError('无效的重复处理策略', 400, 'INVALID_STRATEGY'));
      }

      let result;
      switch (type) {
        case 'students':
          result = await importService.executeStudentsImport(
            data,
            organizationId,
            campusId,
            duplicateStrategy as DuplicateStrategy,
            createMissingClasses !== false,
            duplicates || []
          );
          break;
        case 'classes':
          result = await importService.executeClassesImport(
            data,
            organizationId,
            campusId,
            duplicateStrategy as DuplicateStrategy,
            duplicates || []
          );
          break;
        case 'leads':
          result = await importService.executeLeadsImport(
            data,
            organizationId,
            duplicateStrategy as DuplicateStrategy,
            duplicates || []
          );
          break;
        case 'experiences':
          result = await importService.executeExperiencesImport(
            data,
            organizationId
          );
          break;
        default:
          return next(new ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
      }

      sendSuccess(res, result, result.success ? '导入完成' : '导入部分失败');
    } catch (error) {
      next(error);
    }
  },

  /**
   * 导出失败记录
   * POST /api/import/export-failed
   */
  exportFailedRecords: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { type, details } = req.body;

      const validTypes = ['students', 'classes', 'leads', 'experiences'];
      if (!validTypes.includes(type)) {
        return next(new ApiError('无效的导出类型', 400, 'INVALID_EXPORT_TYPE'));
      }

      if (!details || !Array.isArray(details) || details.length === 0) {
        return next(new ApiError('没有需要导出的记录', 400, 'NO_RECORDS'));
      }

      // 过滤出失败的记录
      const failedRecords = details.filter((d: any) => d.status === 'failed');

      if (failedRecords.length === 0) {
        return next(new ApiError('没有失败的记录', 400, 'NO_FAILED_RECORDS'));
      }

      // 准备导出数据
      const exportData = failedRecords.map((record: any) => ({
        行号: record.row,
        错误信息: record.message,
        ...record.data,
      }));

      // 使用动态导入 xlsx
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '失败记录');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const filenameMap: Record<string, string> = {
        students: '学员导入失败记录.xlsx',
        classes: '班级导入失败记录.xlsx',
        leads: '鱼池导入失败记录.xlsx',
        experiences: '体验课导入失败记录.xlsx',
      };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filenameMap[type])}`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },
};
