"use strict";
/**
 * 批量导入控制器
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importController = void 0;
const database_1 = __importDefault(require("../config/database"));
const leadScope_1 = require("../utils/leadScope");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const importService_1 = require("../services/importService");
// 辅助函数：获取当前用户信息
const getCurrentUser = (req) => {
    return req.user;
};
// 文件大小限制：5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// 允许的文件类型
const ALLOWED_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
];
exports.importController = {
    /**
     * 下载导入模板
     * GET /api/import/template/:type
     */
    downloadTemplate: async (req, res, next) => {
        try {
            const { type } = req.params;
            const validTypes = ['students', 'classes', 'leads', 'experiences'];
            if (!validTypes.includes(type)) {
                return next(new errorHandler_1.ApiError('无效的模板类型', 400, 'INVALID_TEMPLATE_TYPE'));
            }
            let buffer;
            let filename;
            switch (type) {
                case 'students':
                    buffer = importService_1.importService.generateStudentTemplate();
                    filename = '学员导入模板.xlsx';
                    break;
                case 'classes':
                    buffer = importService_1.importService.generateClassTemplate();
                    filename = '班级导入模板.xlsx';
                    break;
                case 'leads':
                    buffer = importService_1.importService.generateLeadTemplate();
                    filename = '鱼池导入模板.xlsx';
                    break;
                case 'experiences':
                    buffer = importService_1.importService.generateExperienceTemplate();
                    filename = '体验课导入模板.xlsx';
                    break;
                default:
                    return next(new errorHandler_1.ApiError('无效的模板类型', 400, 'INVALID_TEMPLATE_TYPE'));
            }
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
            res.send(buffer);
        }
        catch (error) {
            next(error);
        }
    },
    /**
     * 预览导入数据
     * POST /api/import/preview
     */
    previewImport: async (req, res, next) => {
        try {
            const currentUser = getCurrentUser(req);
            const organizationId = currentUser?.organizationId;
            const campusId = currentUser?.campusId;
            if (!organizationId || !campusId || !['admin', 'manager'].includes(currentUser?.role || '')) {
                return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
            }
            const { type } = req.body;
            const file = req.file;
            if (!file) {
                return next(new errorHandler_1.ApiError('请上传文件', 400, 'FILE_REQUIRED'));
            }
            const validTypes = ['students', 'classes', 'leads', 'experiences'];
            if (!validTypes.includes(type)) {
                return next(new errorHandler_1.ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
            }
            // 验证文件类型
            if (!ALLOWED_MIME_TYPES.includes(file.mimetype || '')) {
                return next(new errorHandler_1.ApiError('文件格式不支持，请上传 Excel 文件（.xlsx 或 .xls）', 400, 'INVALID_FILE_TYPE'));
            }
            // 验证文件大小
            if (file.size > MAX_FILE_SIZE) {
                return next(new errorHandler_1.ApiError('文件大小不能超过 5MB', 400, 'FILE_TOO_LARGE'));
            }
            let previewResult;
            switch (type) {
                case 'students':
                    previewResult = await importService_1.importService.previewStudents(file.buffer, organizationId, campusId);
                    break;
                case 'classes':
                    previewResult = await importService_1.importService.previewClasses(file.buffer, organizationId, campusId);
                    break;
                case 'leads':
                    previewResult = await importService_1.importService.previewLeads(file.buffer, organizationId, campusId);
                    break;
                case 'experiences':
                    previewResult = await importService_1.importService.previewExperiences(file.buffer, organizationId, campusId);
                    break;
                default:
                    return next(new errorHandler_1.ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
            }
            (0, response_1.sendSuccess)(res, previewResult);
        }
        catch (error) {
            if (error.message?.includes('Excel')) {
                return next(new errorHandler_1.ApiError(error.message, 400, 'PARSE_ERROR'));
            }
            next(error);
        }
    },
    /**
     * 执行导入
     * POST /api/import/execute
     */
    executeImport: async (req, res, next) => {
        try {
            const currentUser = getCurrentUser(req);
            const organizationId = currentUser?.organizationId;
            const campusId = currentUser?.campusId;
            if (!organizationId || !campusId || !['admin', 'manager'].includes(currentUser?.role || '')) {
                return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
            }
            const { type, data, duplicateStrategy, duplicates, } = req.body;
            const validTypes = ['students', 'classes', 'leads', 'experiences'];
            if (!validTypes.includes(type)) {
                return next(new errorHandler_1.ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
            }
            if (!data || !Array.isArray(data) || data.length === 0) {
                return next(new errorHandler_1.ApiError('导入数据不能为空', 400, 'DATA_REQUIRED'));
            }
            if (!['skip', 'update'].includes(duplicateStrategy)) {
                return next(new errorHandler_1.ApiError('无效的重复处理策略', 400, 'INVALID_STRATEGY'));
            }
            if (data.length > 1000 || data.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))
                throw new errorHandler_1.ApiError('导入数据无效或超过1000行', 400, 'INVALID_PARAMS');
            if (duplicates !== undefined && !Array.isArray(duplicates))
                throw new errorHandler_1.ApiError('重复数据格式无效', 400, 'INVALID_PARAMS');
            // A preview is untrusted client input. Reject any supplied external IDs before writing.
            for (const dup of duplicates || []) {
                const id = dup?.existingRecord?.id;
                if (typeof id !== 'string')
                    throw new errorHandler_1.ApiError('重复记录无效', 400, 'INVALID_PARAMS');
                const found = type === 'students' ? await database_1.default.student.findFirst({ where: { id, organizationId, campusId } }) : type === 'classes' ? await database_1.default.class.findFirst({ where: { id, organizationId, campusId, status: { not: 'deleted' } } }) : type === 'leads' ? await database_1.default.lead.findFirst({ where: { id, ...await (0, leadScope_1.leadCampusWhere)(organizationId, campusId) } }) : null;
                if (!found)
                    throw new errorHandler_1.ApiError('重复记录不属于当前校区', 403, 'FORBIDDEN');
            }
            for (const row of data) {
                const required = type === 'students' ? 'name' : type === 'classes' ? 'name' : type === 'leads' ? 'customerName' : 'studentName';
                if (typeof row[required] !== 'string' || !row[required].trim())
                    throw new errorHandler_1.ApiError('必填姓名不能为空', 400, 'INVALID_PARAMS');
                if (type === 'classes' && row.status === 'deleted')
                    throw new errorHandler_1.ApiError('请使用删除班级操作', 400, 'USE_CLASS_DELETE');
                if (type === 'classes' && row.status !== undefined && !['active', 'inactive', 'completed'].includes(row.status))
                    throw new errorHandler_1.ApiError('班级状态无效', 400, 'INVALID_STATUS');
                for (const key of ['remainingLessons', 'purchasedLessons', 'consumedLessons', 'capacity', 'age'])
                    if (row[key] !== undefined && (!Number.isSafeInteger(row[key]) || row[key] < 0))
                        throw new errorHandler_1.ApiError('课时、容量和年龄必须为非负整数', 400, 'INVALID_PARAMS');
                if (row.organizationId && row.organizationId !== organizationId || row.campusId && row.campusId !== campusId)
                    throw new errorHandler_1.ApiError('导入行不属于当前校区', 403, 'FORBIDDEN');
            }
            let result;
            switch (type) {
                case 'students':
                    result = await importService_1.importService.executeStudentsImport(data, organizationId, campusId, duplicateStrategy, duplicates || []);
                    break;
                case 'classes':
                    result = await importService_1.importService.executeClassesImport(data, organizationId, campusId, duplicateStrategy, duplicates || []);
                    break;
                case 'leads':
                    result = await importService_1.importService.executeLeadsImport(data, organizationId, duplicateStrategy, duplicates || [], campusId, currentUser.id);
                    break;
                case 'experiences':
                    result = await importService_1.importService.executeExperiencesImport(data, organizationId, campusId, currentUser.id);
                    break;
                default:
                    return next(new errorHandler_1.ApiError('无效的导入类型', 400, 'INVALID_IMPORT_TYPE'));
            }
            (0, response_1.sendSuccess)(res, result, result.success ? '导入完成' : '导入部分失败');
        }
        catch (error) {
            next(error);
        }
    },
    /**
     * 导出失败记录
     * POST /api/import/export-failed
     */
    exportFailedRecords: async (req, res, next) => {
        try {
            const { type, details } = req.body;
            const validTypes = ['students', 'classes', 'leads', 'experiences'];
            if (!validTypes.includes(type)) {
                return next(new errorHandler_1.ApiError('无效的导出类型', 400, 'INVALID_EXPORT_TYPE'));
            }
            if (!details || !Array.isArray(details) || details.length === 0) {
                return next(new errorHandler_1.ApiError('没有需要导出的记录', 400, 'NO_RECORDS'));
            }
            // 过滤出失败的记录
            const failedRecords = details.filter((d) => d.status === 'failed');
            if (failedRecords.length === 0) {
                return next(new errorHandler_1.ApiError('没有失败的记录', 400, 'NO_FAILED_RECORDS'));
            }
            // 准备导出数据
            const exportData = failedRecords.map((record) => ({
                行号: record.row,
                错误信息: record.message,
                ...record.data,
            }));
            // 使用动态导入 xlsx
            const XLSX = await Promise.resolve().then(() => __importStar(require('xlsx')));
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, '失败记录');
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            const filenameMap = {
                students: '学员导入失败记录.xlsx',
                classes: '班级导入失败记录.xlsx',
                leads: '鱼池导入失败记录.xlsx',
                experiences: '体验课导入失败记录.xlsx',
            };
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filenameMap[type])}`);
            res.send(buffer);
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=importController.js.map