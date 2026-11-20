"use strict";
/**
 * 批量导入服务层
 * 处理 Excel 解析、数据验证、批量导入等核心逻辑
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
exports.importService = void 0;
exports.parseExcelFile = parseExcelFile;
exports.generateStudentTemplate = generateStudentTemplate;
exports.generateClassTemplate = generateClassTemplate;
exports.generateLeadTemplate = generateLeadTemplate;
exports.generateExperienceTemplate = generateExperienceTemplate;
exports.previewStudents = previewStudents;
exports.previewClasses = previewClasses;
exports.executeStudentsImport = executeStudentsImport;
exports.executeClassesImport = executeClassesImport;
exports.previewLeads = previewLeads;
exports.executeLeadsImport = executeLeadsImport;
exports.previewExperiences = previewExperiences;
exports.executeExperiencesImport = executeExperiencesImport;
const XLSX = __importStar(require("xlsx"));
const database_1 = __importDefault(require("../config/database"));
const scheduleConflicts_1 = require("./scheduleConflicts");
const experiencePersonIdentity_1 = require("./experiencePersonIdentity");
const classScheduleStatus_1 = require("./classScheduleStatus");
const enrollmentPeriod_1 = require("./enrollmentPeriod");
const errorHandler_1 = require("../middleware/errorHandler");
async function lockImportAssignee(tx, organizationId, campusId, id) {
    await tx.$queryRaw `SELECT id FROM users WHERE id=${id} AND "organizationId"=${organizationId} FOR UPDATE`;
    const user = await tx.user.findFirst({ where: { id, organizationId, campusId, isActive: true, isPlatformAdmin: false }, select: { id: true, name: true } });
    if (!user)
        throw new errorHandler_1.ApiError('跟进负责人已停用或不属于当前校区', 409, 'ASSIGNEE_UNAVAILABLE');
    return user;
}
const leadScope_1 = require("../utils/leadScope");
const importValidator_1 = require("../validators/importValidator");
// 批量导入配置
const MAX_ROWS = 1000;
const BATCH_SIZE = 50;
/**
 * 解析 Excel 文件
 */
function parseExcelFile(buffer) {
    const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true, // 关键：将日期解析为 Date 对象而非数字
        cellNF: false,
        cellText: false,
    });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        throw new Error('Excel 文件没有工作表');
    }
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return data;
}
const importLessonMessage = 'Excel 仅可建立零课时档案；付费课时请通过成单或关联原单导入，赠课请通过增课办理';
const hasOpeningLessons = (row) => ['purchasedLessons', 'consumedLessons', 'remainingLessons'].some(key => Number(row[key] ?? 0) > 0);
/**
 * 生成学员导入模板
 */
function generateStudentTemplate() {
    const headers = [
        '学员姓名',
        '性别',
        '年龄',
        '家长姓名',
        '家长电话',
        '家长邮箱',
        '所属班级名称',
        '负责教练',
        '已购课时',
        '消耗课时',
        '剩余课时',
        '缴费金额',
        '销售',
        '备注',
    ];
    const exampleData = [
        [
            '张三',
            'M',
            '9',
            '张父',
            '13900139000',
            'parent@example.com',
            '周一基础班',
            '李教练',
            '0',
            '0',
            '0',
            '0',
            '王销售',
            '试听课学员',
        ],
        [
            '李四',
            'F',
            '8',
            '李母',
            '13900139001',
            '',
            '周三进阶班',
            '王教练',
            '0',
            '0',
            '0',
            '0',
            '',
            '',
        ],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
    // 设置列宽
    worksheet['!cols'] = [
        { wch: 12 }, // 学员姓名
        { wch: 6 }, // 性别
        { wch: 6 }, // 年龄
        { wch: 10 }, // 家长姓名
        { wch: 14 }, // 家长电话
        { wch: 20 }, // 家长邮箱
        { wch: 18 }, // 所属班级名称
        { wch: 10 }, // 负责教练
        { wch: 10 }, // 已购课时
        { wch: 10 }, // 消耗课时
        { wch: 10 }, // 剩余课时
        { wch: 10 }, // 缴费金额
        { wch: 10 }, // 销售
        { wch: 20 }, // 备注
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '学员导入模板');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
/**
 * 生成班级导入模板
 */
function generateClassTemplate() {
    const headers = ['班级名称', '课程类型', '班级水平', '容量', '负责教练', '状态'];
    const exampleData = [
        ['周一基础班', '篮球基础', '第一阶段', '20', '李教练', 'active'],
        ['周三进阶班', '篮球进阶', '第二阶段', '15', '王教练', 'active'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
    // 设置列宽
    worksheet['!cols'] = [
        { wch: 15 }, // 班级名称
        { wch: 12 }, // 课程类型
        { wch: 10 }, // 班级水平
        { wch: 8 }, // 容量
        { wch: 10 }, // 负责教练
        { wch: 10 }, // 状态
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '班级导入模板');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
/**
 * 生成鱼池（线索）导入模板
 */
function generateLeadTemplate() {
    const headers = ['客户姓名', '年龄', '联系方式', '备注', '最近联系时间', '负责人'];
    const exampleData = [
        ['张小明', '8', '13800138000', '对篮球感兴趣', '2024-01-15', '王销售'],
        ['李小红', '10', '13900139000', '朋友推荐', '2024-01-16', '李销售'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
    worksheet['!cols'] = [
        { wch: 12 }, // 客户姓名
        { wch: 6 }, // 年龄
        { wch: 14 }, // 联系方式
        { wch: 20 }, // 备注
        { wch: 14 }, // 最近联系时间
        { wch: 10 }, // 负责人
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '鱼池导入模板');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
/**
 * 生成体验课导入模板
 */
function generateExperienceTemplate() {
    const headers = [
        '学员姓名',
        '年龄',
        '联系方式',
        '来源',
        '班级名称',
        '预约日期',
        '授课教练',
        '负责人',
        '状态',
        '备注',
    ];
    const exampleData = [
        [
            '张小明',
            '8',
            '13800138000',
            '鱼池转化',
            '周一基础班',
            '2024-01-20',
            '李教练',
            '王销售',
            'pending',
            '首次体验',
        ],
        [
            '李小红',
            '10',
            '13900139000',
            '朋友推荐',
            '周三进阶班',
            '2024-01-22',
            '王教练',
            '李销售',
            'pending',
            '',
        ],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
    worksheet['!cols'] = [
        { wch: 12 }, // 学员姓名
        { wch: 6 }, // 年龄
        { wch: 14 }, // 联系方式
        { wch: 10 }, // 来源
        { wch: 14 }, // 班级名称
        { wch: 12 }, // 预约日期
        { wch: 10 }, // 授课教练
        { wch: 10 }, // 负责人
        { wch: 10 }, // 状态
        { wch: 20 }, // 备注
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '体验课导入模板');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
/**
 * 预览学员导入数据
 */
async function previewStudents(buffer, organizationId, campusId) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const rows = parseExcelFile(buffer);
    if (rows.length === 0) {
        throw new Error('Excel 文件没有数据');
    }
    if (rows.length > MAX_ROWS) {
        throw new Error(`单次导入最多支持 ${MAX_ROWS} 行数据`);
    }
    const preview = [];
    const duplicates = [];
    // 获取所有家长电话，用于检查重复
    const parentPhones = rows
        .map((row, index) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.STUDENT_COLUMN_MAPPING);
        return mapped.parentPhone;
    })
        .filter(Boolean);
    // 批量查询已有的学员（按家长电话）
    let existingStudentsMap = {};
    if (parentPhones.length > 0) {
        const existingStudents = await database_1.default.student.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                parentPhone: { in: parentPhones },
            },
        });
        existingStudentsMap = (existingStudents || []).reduce((acc, s) => {
            if (s.parentPhone) {
                acc[s.parentPhone] = s;
            }
            return acc;
        }, {});
    }
    // 获取所有班级名称和负责教练，用于验证（班级由名称+教练共同确定）
    const classInfoList = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.STUDENT_COLUMN_MAPPING);
        return {
            className: mapped.className,
            teacherName: mapped.teacherName,
        };
    })
        .filter((info) => info.className);
    // 获取所有教练ID映射
    const teacherNames = classInfoList.map((info) => info.teacherName).filter(Boolean);
    let teachersMap = {};
    if (teacherNames.length > 0) {
        const teachers = await database_1.default.user.findMany({
            where: { organizationId: organizationId, campusId: campusId, name: { in: teacherNames } },
            select: { id: true, name: true },
        });
        teachersMap = (teachers || []).reduce((acc, t) => {
            acc[t.name] = t;
            return acc;
        }, {});
    }
    // 构建班级映射（className-teacherId 组合）
    let existingClassesMap = {};
    const classNames = [...new Set(classInfoList.map((info) => info.className))];
    if (classNames.length > 0) {
        const existingClasses = await database_1.default.class.findMany({
            where: {
                organizationId: organizationId,
                status: { not: 'deleted' },
                campusId: campusId,
                name: { in: classNames },
            },
            select: { id: true, name: true, teacherId: true },
        });
        existingClassesMap = (existingClasses || []).reduce((acc, c) => {
            // 使用 className-teacherId 作为组合键
            const key = c.teacherId ? `${c.name}-${c.teacherId}` : c.name;
            acc[key] = c;
            return acc;
        }, {});
    }
    // 获取所有销售姓名，用于验证
    const salesNames = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.STUDENT_COLUMN_MAPPING);
        return mapped.salesName;
    })
        .filter(Boolean);
    let salesMap = {};
    if (salesNames.length > 0) {
        const salesUsers = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['admin', 'manager', 'sales', 'coach'] },
            },
            select: { id: true, name: true },
        });
        salesMap = (salesUsers || []).reduce((acc, u) => {
            acc[u.name] = u;
            return acc;
        }, {});
    }
    // 验证每一行数据
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.STUDENT_COLUMN_MAPPING);
        const rowData = { row: i + 2, ...mapped }; // +2 因为 Excel 行号从 1 开始，且有表头
        const validation = (0, importValidator_1.validateStudentRow)(rowData);
        const normalized = (0, importValidator_1.normalizeStudentRow)(rowData);
        const item = {
            row: i + 2,
            data: normalized,
            isValid: validation.isValid,
            errors: validation.errors,
        };
        // 检查重复（按家长电话）
        if (normalized.parentPhone && existingStudentsMap[normalized.parentPhone]) {
            item.isDuplicate = true;
            duplicates.push({
                row: i + 2,
                data: normalized,
                existingRecord: existingStudentsMap[normalized.parentPhone],
            });
        }
        if (!item.isDuplicate && hasOpeningLessons(normalized)) {
            item.isValid = false;
            item.errors.push(importLessonMessage);
        }
        // 检查班级是否存在（由班级名称+教练共同确定，仅警告，不阻止导入）
        if (normalized.className) {
            const teacherId = normalized.teacherName && teachersMap[normalized.teacherName]
                ? teachersMap[normalized.teacherName].id
                : null;
            const classKey = teacherId ? `${normalized.className}-${teacherId}` : normalized.className;
            if (!existingClassesMap[classKey]) {
                if (teacherId) {
                    item.errors.push(`班级 "${normalized.className}"（教练：${normalized.teacherName}）不存在，将不会自动分配`);
                }
                else {
                    item.errors.push(`班级 "${normalized.className}" 不存在，将不会自动分配`);
                }
            }
        }
        // 检查教练是否存在（仅警告）
        if (normalized.teacherName && !teachersMap[normalized.teacherName]) {
            item.errors.push(`教练 "${normalized.teacherName}" 不存在`);
        }
        // 检查销售是否存在（仅警告）
        if (normalized.salesName && !salesMap[normalized.salesName]) {
            item.errors.push(`销售 "${normalized.salesName}" 不存在`);
        }
        preview.push(item);
    }
    const valid = preview.filter((p) => p.isValid).length;
    const invalid = preview.filter((p) => !p.isValid).length;
    return {
        total: rows.length,
        valid,
        invalid,
        preview,
        duplicates,
    };
}
/**
 * 预览班级导入数据
 */
async function previewClasses(buffer, organizationId, campusId) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const rows = parseExcelFile(buffer);
    if (rows.length === 0) {
        throw new Error('Excel 文件没有数据');
    }
    if (rows.length > MAX_ROWS) {
        throw new Error(`单次导入最多支持 ${MAX_ROWS} 行数据`);
    }
    const preview = [];
    const duplicates = [];
    // 获取所有班级名称，用于检查重复
    const classNames = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.CLASS_COLUMN_MAPPING);
        return mapped.name;
    })
        .filter(Boolean);
    // 批量查询已有的班级（按名称）
    let existingClassesMap = {};
    if (classNames.length > 0) {
        const existingClasses = await database_1.default.class.findMany({
            where: {
                organizationId: organizationId,
                status: { not: 'deleted' },
                campusId: campusId,
                name: { in: classNames },
            },
        });
        existingClassesMap = (existingClasses || []).reduce((acc, c) => {
            acc[c.name] = c;
            return acc;
        }, {});
    }
    // 获取所有教练姓名，用于验证
    const teacherNames = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.CLASS_COLUMN_MAPPING);
        return mapped.teacherName;
    })
        .filter(Boolean);
    let teachersMap = {};
    if (teacherNames.length > 0) {
        const teachers = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['teacher', 'coach', 'manager'] },
            },
            select: { id: true, name: true },
        });
        teachersMap = (teachers || []).reduce((acc, t) => {
            acc[t.name] = t;
            return acc;
        }, {});
    }
    // 验证每一行数据
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.CLASS_COLUMN_MAPPING);
        const rowData = { row: i + 2, ...mapped };
        const validation = (0, importValidator_1.validateClassRow)(rowData);
        const normalized = (0, importValidator_1.normalizeClassRow)(rowData);
        const item = {
            row: i + 2,
            data: normalized,
            isValid: validation.isValid,
            errors: validation.errors,
        };
        // 检查重复（按名称）
        if (normalized.name && existingClassesMap[normalized.name]) {
            item.isDuplicate = true;
            duplicates.push({
                row: i + 2,
                data: normalized,
                existingRecord: existingClassesMap[normalized.name],
            });
        }
        // 检查教练是否存在（仅警告）
        if (normalized.teacherName && !teachersMap[normalized.teacherName]) {
            item.errors.push(`教练 "${normalized.teacherName}" 不存在`);
        }
        preview.push(item);
    }
    const valid = preview.filter((p) => p.isValid).length;
    const invalid = preview.filter((p) => !p.isValid).length;
    return {
        total: rows.length,
        valid,
        invalid,
        preview,
        duplicates,
    };
}
/**
 * 执行学员导入
 */
async function executeStudentsImport(data, organizationId, campusId, duplicateStrategy, duplicates) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const result = {
        success: true,
        summary: { total: data.length, created: 0, updated: 0, skipped: 0, failed: 0 },
        details: [],
    };
    // 构建重复数据映射（用于快速查找）
    const duplicateMap = new Map();
    const existingRows = await database_1.default.student.findMany({ where: { organizationId, campusId } });
    for (const existing of existingRows)
        if (existing.parentPhone)
            duplicateMap.set(existing.parentPhone, existing);
    // 获取班级映射（由班级名称+教练共同确定）
    const classInfoList = data
        .map((d) => ({
        className: d.className,
        teacherName: d.teacherName,
    }))
        .filter((info) => info.className);
    // 获取教练映射
    const teacherNames = classInfoList.map((info) => info.teacherName).filter(Boolean);
    let teachersMap = {};
    if (teacherNames.length > 0) {
        const teachers = await database_1.default.user.findMany({
            where: { organizationId: organizationId, campusId: campusId, name: { in: teacherNames } },
            select: { id: true, name: true },
        });
        teachersMap = (teachers || []).reduce((acc, t) => {
            acc[t.name] = t;
            return acc;
        }, {});
    }
    // 构建班级映射（className-teacherId 组合）
    let classesMap = {};
    const classNames = [...new Set(classInfoList.map((info) => info.className))];
    if (classNames.length > 0) {
        const existingClasses = await database_1.default.class.findMany({
            where: {
                organizationId: organizationId,
                status: { not: 'deleted' },
                campusId: campusId,
                name: { in: classNames },
            },
            select: { id: true, name: true, teacherId: true },
        });
        classesMap = (existingClasses || []).reduce((acc, c) => {
            const key = c.teacherId ? `${c.name}-${c.teacherId}` : c.name;
            acc[key] = c;
            return acc;
        }, {});
    }
    // 获取销售映射
    const salesNames = data.map((d) => d.salesName).filter(Boolean);
    let salesMap = {};
    if (salesNames.length > 0) {
        const salesUsers = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['admin', 'manager', 'sales', 'coach'] },
            },
            select: { id: true, name: true },
        });
        salesMap = (salesUsers || []).reduce((acc, u) => {
            acc[u.name] = u;
            return acc;
        }, {});
    }
    // 分批处理
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        for (const item of batch) {
            const rowIndex = i + batch.indexOf(item) + 2;
            try {
                // 检查是否重复
                const existingRecord = duplicateMap.get(item.parentPhone);
                if (existingRecord) {
                    if (duplicateStrategy === 'skip') {
                        result.summary.skipped++;
                        result.details.push({
                            row: rowIndex,
                            status: 'skipped',
                            message: `学员已存在（家长电话: ${item.parentPhone}）`,
                            data: item,
                        });
                        continue;
                    }
                    if (['remainingLessons', 'purchasedLessons', 'consumedLessons', 'totalPayment'].some((key) => item[key] !== undefined && Number(item[key]) !== Number(existingRecord[key])))
                        throw new errorHandler_1.ApiError('已有学员课时与金额不能通过导入覆盖，请走课时或收退款业务', 409, 'USE_FINANCIAL_TRANSACTION');
                    // 更新现有记录
                    const updateData = {};
                    if (item.name)
                        updateData.name = item.name;
                    if (item.gender)
                        updateData.gender = item.gender;
                    if (item.birthDate)
                        updateData.birthDate = new Date(item.birthDate);
                    if (item.phone)
                        updateData.phone = item.phone;
                    if (item.parentName)
                        updateData.parentName = item.parentName;
                    if (item.parentEmail)
                        updateData.parentEmail = item.parentEmail;
                    if (item.notes)
                        updateData.notes = item.notes;
                    // 课时与金额信息更新
                    if (item.salesName && salesMap[item.salesName]) {
                        updateData.salesId = salesMap[item.salesName].id;
                    }
                    await database_1.default.$transaction(async (tx) => { if (updateData.salesId && campusId)
                        await lockImportAssignee(tx, organizationId, campusId, String(updateData.salesId)); await tx.student.updateMany({ where: { id: existingRecord.id }, data: updateData }); });
                    result.summary.updated++;
                    result.details.push({
                        row: rowIndex,
                        status: 'updated',
                        message: '学员更新成功',
                        data: item,
                    });
                }
                else {
                    if (hasOpeningLessons(item))
                        throw new errorHandler_1.ApiError(importLessonMessage, 409, 'USE_ORDER_REQUIRED');
                    // 创建新记录
                    const newStudent = {
                        name: item.name,
                        organizationId,
                        campusId: campusId || null,
                        status: 'active',
                        // 开卡时间默认为当天
                        cardOpenDate: new Date(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) + 'T00:00:00+08:00'),
                    };
                    if (item.gender)
                        newStudent.gender = item.gender;
                    if (item.birthDate)
                        newStudent.birthDate = new Date(item.birthDate);
                    if (item.phone)
                        newStudent.phone = item.phone;
                    if (item.parentName)
                        newStudent.parentName = item.parentName;
                    if (item.parentPhone)
                        newStudent.parentPhone = item.parentPhone;
                    if (item.parentEmail)
                        newStudent.parentEmail = item.parentEmail;
                    if (item.remainingLessons !== undefined)
                        newStudent.remainingLessons = item.remainingLessons;
                    if (item.notes)
                        newStudent.notes = item.notes;
                    // 课时与金额信息
                    if (item.purchasedLessons !== undefined)
                        newStudent.purchasedLessons = item.purchasedLessons;
                    if (item.consumedLessons !== undefined)
                        newStudent.consumedLessons = item.consumedLessons;
                    if (item.totalPayment !== undefined)
                        newStudent.totalPayment = item.totalPayment;
                    if (item.salesName && salesMap[item.salesName]) {
                        newStudent.salesId = salesMap[item.salesName].id;
                    }
                    // A full/unavailable class rolls back this new student as well, so a
                    // failed import row cannot leave a silently unenrolled student behind.
                    await database_1.default.$transaction(async (tx) => {
                        if (newStudent.salesId && campusId)
                            await lockImportAssignee(tx, organizationId, campusId, String(newStudent.salesId));
                        const created = await tx.student.create({
                            data: newStudent,
                        });
                        if (item.className) {
                            const teacherId = item.teacherName && teachersMap[item.teacherName]
                                ? teachersMap[item.teacherName].id
                                : null;
                            const classKey = teacherId ? `${item.className}-${teacherId}` : item.className;
                            const classData = classesMap[classKey];
                            if (!classData)
                                throw new errorHandler_1.ApiError('导入指定的班级不可用', 409, 'CLASS_UNAVAILABLE');
                            if (!created.campusId)
                                throw new errorHandler_1.ApiError('导入学员未分配校区，无法报名', 409, 'CAMPUS_REQUIRED');
                            const scope = { organizationId, campusId: created.campusId };
                            await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, created.id, scope);
                            await (0, enrollmentPeriod_1.enrollForConversion)(tx, created.id, classData.id, scope, false);
                        }
                    });
                    result.summary.created++;
                    result.details.push({
                        row: rowIndex,
                        status: 'created',
                        message: '学员创建成功',
                        data: item,
                    });
                }
            }
            catch (err) {
                result.summary.failed++;
                result.details.push({
                    row: rowIndex,
                    status: 'failed',
                    message: `处理异常: ${err.message}`,
                    data: item,
                });
            }
        }
    }
    // 如果全部失败，设置 success 为 false
    if (result.summary.failed > 0 && result.summary.created === 0 && result.summary.updated === 0) {
        result.success = false;
    }
    return result;
}
/**
 * 执行班级导入
 */
async function executeClassesImport(data, organizationId, campusId, duplicateStrategy, duplicates) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const result = {
        success: true,
        summary: { total: data.length, created: 0, updated: 0, skipped: 0, failed: 0 },
        details: [],
    };
    // 构建重复数据映射
    const duplicateMap = new Map();
    const existingRows = await database_1.default.class.findMany({
        where: { organizationId, campusId, status: { not: 'deleted' } },
    });
    for (const existing of existingRows)
        if (existing.name)
            duplicateMap.set(existing.name, existing);
    // 获取教练映射
    const teacherNames = data.map((d) => d.teacherName).filter(Boolean);
    let teachersMap = {};
    if (teacherNames.length > 0) {
        const teachers = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['teacher', 'coach', 'manager'] },
            },
            select: { id: true, name: true },
        });
        teachersMap = (teachers || []).reduce((acc, t) => {
            acc[t.name] = t;
            return acc;
        }, {});
    }
    // 分批处理
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        for (const item of batch) {
            const rowIndex = i + batch.indexOf(item) + 2;
            try {
                // 检查是否重复
                const existingRecord = duplicateMap.get(item.name);
                if (existingRecord) {
                    if (duplicateStrategy === 'skip') {
                        result.summary.skipped++;
                        result.details.push({
                            row: rowIndex,
                            status: 'skipped',
                            message: `班级已存在（名称: ${item.name}）`,
                            data: item,
                        });
                        continue;
                    }
                    // 更新现有记录
                    const updateData = {};
                    if (item.name)
                        updateData.name = item.name;
                    if (item.courseType)
                        updateData.courseType = item.courseType;
                    // 班级水平已弃用（2026-11-07 产品拍板）：导入含 level 列时静默忽略，不再写入
                    if (item.capacity)
                        updateData.capacity = item.capacity;
                    if (item.status)
                        updateData.status = item.status;
                    // 更新教练
                    if (item.teacherName && teachersMap[item.teacherName]) {
                        updateData.teacherId = teachersMap[item.teacherName].id;
                    }
                    await database_1.default.$transaction(async (tx) => {
                        await (0, scheduleConflicts_1.lockScheduleWrites)(tx, organizationId);
                        const current = await tx.class.findFirst({
                            where: {
                                id: existingRecord.id,
                                organizationId,
                                campusId,
                                status: { not: 'deleted' },
                            },
                        });
                        if (!current)
                            throw new errorHandler_1.ApiError('班级已删除，请刷新后重新导入', 409, 'CLASS_UNAVAILABLE');
                        if (item.status)
                            await (0, classScheduleStatus_1.syncClassScheduleStatus)(tx, current, item.status);
                        await tx.class.update({ where: { id: current.id }, data: updateData });
                    }, { timeout: 30000 });
                    result.summary.updated++;
                    result.details.push({
                        row: rowIndex,
                        status: 'updated',
                        message: '班级更新成功',
                        data: item,
                    });
                }
                else {
                    // 创建新记录
                    // 生成唯一的班级编码（使用时间戳 + 随机数）
                    const generateClassCode = () => {
                        const timestamp = Date.now().toString(36);
                        const random = Math.random().toString(36).substring(2, 6);
                        return `CLS-${timestamp}-${random}`.toUpperCase();
                    };
                    const newClass = {
                        name: item.name,
                        code: generateClassCode(), // 自动生成唯一编码
                        courseType: item.courseType,
                        organizationId,
                        campusId: campusId || null,
                        capacity: item.capacity || 20,
                        status: item.status || 'active',
                    };
                    // 班级水平已弃用（2026-11-07 产品拍板）：导入含 level 列时静默忽略，不再写入
                    // 设置教练
                    if (item.teacherName && teachersMap[item.teacherName]) {
                        newClass.teacherId = teachersMap[item.teacherName].id;
                    }
                    await database_1.default.class.create({ data: newClass });
                    result.summary.created++;
                    result.details.push({
                        row: rowIndex,
                        status: 'created',
                        message: '班级创建成功',
                        data: item,
                    });
                }
            }
            catch (err) {
                result.summary.failed++;
                result.details.push({
                    row: rowIndex,
                    status: 'failed',
                    message: `处理异常: ${err.message}`,
                    data: item,
                });
            }
        }
    }
    // 如果全部失败，设置 success 为 false
    if (result.summary.failed > 0 && result.summary.created === 0 && result.summary.updated === 0) {
        result.success = false;
    }
    return result;
}
/**
 * 预览鱼池（线索）导入数据
 */
async function previewLeads(buffer, organizationId, campusId) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const scopedLeadIds = (await database_1.default.lead.findMany({
        where: await (0, leadScope_1.leadCampusWhere)(organizationId, campusId),
        select: { id: true },
    })).map((l) => l.id);
    const rows = parseExcelFile(buffer);
    if (rows.length === 0) {
        throw new Error('Excel 文件没有数据');
    }
    if (rows.length > MAX_ROWS) {
        throw new Error(`单次导入最多支持 ${MAX_ROWS} 行数据`);
    }
    const preview = [];
    const duplicates = [];
    // 获取所有联系方式，用于检查重复
    const contacts = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.LEAD_COLUMN_MAPPING);
        return mapped.contact;
    })
        .filter(Boolean);
    // 批量查询已有的线索
    let existingLeadsMap = {};
    if (contacts.length > 0) {
        const existingLeads = await database_1.default.lead.findMany({
            where: {
                organizationId: organizationId,
                id: { in: scopedLeadIds },
                contact: { in: contacts },
            },
        });
        existingLeadsMap = (existingLeads || []).reduce((acc, l) => {
            acc[l.contact] = l;
            return acc;
        }, {});
    }
    // 获取负责人列表
    const assigneeNames = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.LEAD_COLUMN_MAPPING);
        return mapped.assigneeName;
    })
        .filter(Boolean);
    let assigneeMap = {};
    if (assigneeNames.length > 0) {
        const assignees = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['admin', 'manager', 'sales', 'coach'] },
            },
            select: { id: true, name: true },
        });
        assigneeMap = (assignees || []).reduce((acc, u) => {
            acc[u.name] = u;
            return acc;
        }, {});
    }
    // 验证每一行数据
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.LEAD_COLUMN_MAPPING);
        const rowData = { row: i + 2, ...mapped };
        const validation = (0, importValidator_1.validateLeadRow)(rowData);
        const normalized = (0, importValidator_1.normalizeLeadRow)(rowData);
        const item = {
            row: i + 2,
            data: normalized,
            isValid: validation.isValid,
            errors: validation.errors,
        };
        // 检查重复
        if (normalized.contact && existingLeadsMap[normalized.contact]) {
            item.isDuplicate = true;
            duplicates.push({
                row: i + 2,
                data: normalized,
                existingRecord: existingLeadsMap[normalized.contact],
            });
        }
        // 检查负责人是否存在
        if (normalized.assigneeName && !assigneeMap[normalized.assigneeName]) {
            item.errors.push(`负责人 "${normalized.assigneeName}" 不存在`);
        }
        preview.push(item);
    }
    const valid = preview.filter((p) => p.isValid).length;
    const invalid = preview.filter((p) => !p.isValid).length;
    return { total: rows.length, valid, invalid, preview, duplicates };
}
/**
 * 执行鱼池（线索）导入
 */
async function executeLeadsImport(data, organizationId, duplicateStrategy, duplicates, campusId, actorId) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const scopedLeadIds = (await database_1.default.lead.findMany({
        where: await (0, leadScope_1.leadCampusWhere)(organizationId, campusId),
        select: { id: true },
    })).map((l) => l.id);
    const result = {
        success: true,
        summary: { total: data.length, created: 0, updated: 0, skipped: 0, failed: 0 },
        details: [],
    };
    // 构建重复数据映射
    const duplicateMap = new Map();
    const existingRows = await database_1.default.lead.findMany({
        where: await (0, leadScope_1.leadCampusWhere)(organizationId, campusId),
    });
    for (const existing of existingRows)
        if (existing.contact)
            duplicateMap.set(existing.contact, existing);
    // 获取负责人映射
    const assigneeNames = data.map((d) => d.assigneeName).filter(Boolean);
    let assigneeMap = {};
    if (assigneeNames.length > 0) {
        const assignees = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['admin', 'manager', 'sales', 'coach'] },
            },
            select: { id: true, name: true },
        });
        assigneeMap = (assignees || []).reduce((acc, u) => {
            acc[u.name] = u;
            return acc;
        }, {});
    }
    // 分批处理
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        for (const item of batch) {
            const rowIndex = i + batch.indexOf(item) + 2;
            try {
                const existingRecord = duplicateMap.get(item.contact);
                if (existingRecord) {
                    if (duplicateStrategy === 'skip') {
                        result.summary.skipped++;
                        result.details.push({
                            row: rowIndex,
                            status: 'skipped',
                            message: `线索已存在（联系方式: ${item.contact}）`,
                        });
                        continue;
                    }
                    // 更新
                    const updateData = {};
                    if (item.customerName)
                        updateData.customerName = item.customerName;
                    if (item.age !== undefined)
                        updateData.age = item.age;
                    if (item.notes)
                        updateData.notes = item.notes;
                    if (item.lastContactAt)
                        updateData.lastContactAt = new Date(item.lastContactAt);
                    if (item.assigneeName && assigneeMap[item.assigneeName]) {
                        updateData.assigneeId = assigneeMap[item.assigneeName].id;
                    }
                    await database_1.default.$transaction(async (tx) => { const id = updateData.assigneeId || existingRecord.assigneeId; if (id && !['converted', 'lost'].includes(existingRecord.status)) {
                        const u = await lockImportAssignee(tx, organizationId, campusId, id);
                        if (updateData.assigneeId)
                            updateData.assigneeName = u.name;
                    } const changed = await tx.lead.updateMany({ where: { id: existingRecord.id, updatedAt: existingRecord.updatedAt }, data: updateData }); if (!changed.count)
                        throw new errorHandler_1.ApiError('线索已变化，请重试', 409, 'RESOURCE_CHANGED'); });
                    result.summary.updated++;
                    result.details.push({ row: rowIndex, status: 'updated', message: '线索更新成功' });
                }
                else {
                    // 创建
                    const newLead = {
                        customerName: item.customerName,
                        contact: item.contact,
                        organizationId,
                        assigneeId: actorId,
                        createdById: actorId,
                    };
                    if (item.age !== undefined)
                        newLead.age = item.age;
                    if (item.notes)
                        newLead.notes = item.notes;
                    if (item.lastContactAt)
                        newLead.lastContactAt = new Date(item.lastContactAt);
                    if (item.assigneeName && assigneeMap[item.assigneeName]) {
                        newLead.assigneeId = assigneeMap[item.assigneeName].id;
                    }
                    await database_1.default.$transaction(async (tx) => { const u = await lockImportAssignee(tx, organizationId, campusId, newLead.assigneeId); newLead.assigneeName = u.name; await tx.lead.create({ data: newLead }); });
                    result.summary.created++;
                    result.details.push({ row: rowIndex, status: 'created', message: '线索创建成功' });
                }
            }
            catch (err) {
                result.summary.failed++;
                result.details.push({
                    row: rowIndex,
                    status: 'failed',
                    message: `处理异常: ${err.message}`,
                });
            }
        }
    }
    if (result.summary.failed > 0 && result.summary.created === 0 && result.summary.updated === 0) {
        result.success = false;
    }
    return result;
}
/**
 * 预览体验课导入数据
 */
async function previewExperiences(buffer, organizationId, campusId) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const rows = parseExcelFile(buffer);
    if (rows.length === 0) {
        throw new Error('Excel 文件没有数据');
    }
    if (rows.length > MAX_ROWS) {
        throw new Error(`单次导入最多支持 ${MAX_ROWS} 行数据`);
    }
    const preview = [];
    const duplicates = [];
    // 获取教练映射
    const teacherNames = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.EXPERIENCE_COLUMN_MAPPING);
        return mapped.teachingTeacherName;
    })
        .filter(Boolean);
    let teacherMap = {};
    if (teacherNames.length > 0) {
        const teachers = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['teacher', 'coach', 'manager'] },
            },
            select: { id: true, name: true },
        });
        teacherMap = (teachers || []).reduce((acc, t) => {
            acc[t.name] = t;
            return acc;
        }, {});
    }
    // 获取负责人映射
    const assigneeNames = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.EXPERIENCE_COLUMN_MAPPING);
        return mapped.assigneeName;
    })
        .filter(Boolean);
    let assigneeMap = {};
    if (assigneeNames.length > 0) {
        const assignees = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['admin', 'manager', 'sales', 'coach'] },
            },
            select: { id: true, name: true },
        });
        assigneeMap = (assignees || []).reduce((acc, u) => {
            acc[u.name] = u;
            return acc;
        }, {});
    }
    // 获取班级映射
    const classNames = rows
        .map((row) => {
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.EXPERIENCE_COLUMN_MAPPING);
        return mapped.className;
    })
        .filter(Boolean);
    let classMap = {};
    if (classNames.length > 0) {
        const classes = await database_1.default.class.findMany({
            where: { organizationId: organizationId, status: { not: 'deleted' }, campusId: campusId },
            select: { id: true, name: true },
        });
        classMap = (classes || []).reduce((acc, c) => {
            acc[c.name] = c;
            return acc;
        }, {});
    }
    // 验证每一行数据
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mapped = (0, importValidator_1.mapRowToFields)(row, importValidator_1.EXPERIENCE_COLUMN_MAPPING);
        const rowData = { row: i + 2, ...mapped };
        const validation = (0, importValidator_1.validateExperienceRow)(rowData);
        const normalized = (0, importValidator_1.normalizeExperienceRow)(rowData);
        const item = {
            row: i + 2,
            data: normalized,
            isValid: validation.isValid,
            errors: validation.errors,
        };
        // 检查教练是否存在
        if (normalized.teachingTeacherName && !teacherMap[normalized.teachingTeacherName]) {
            item.errors.push(`教练 "${normalized.teachingTeacherName}" 不存在`);
        }
        // 检查负责人是否存在
        if (normalized.assigneeName && !assigneeMap[normalized.assigneeName]) {
            item.errors.push(`负责人 "${normalized.assigneeName}" 不存在`);
        }
        // 检查班级是否存在
        if (normalized.className && !classMap[normalized.className]) {
            item.errors.push(`班级 "${normalized.className}" 不存在`);
        }
        preview.push(item);
    }
    const candidates = preview.filter(item => item.errors.length === 0);
    const names = [...new Set(candidates.map(item => (0, experiencePersonIdentity_1.experiencePerson)({ studentName: item.data.studentName, contact: item.data.contact }).name))];
    const seen = await (0, experiencePersonIdentity_1.existingPersonKeys)(database_1.default, organizationId, names);
    for (const item of candidates) {
        const key = (0, experiencePersonIdentity_1.experiencePersonKey)({ studentName: item.data.studentName, contact: item.data.contact });
        if (seen.has(key)) {
            item.errors.push(experiencePersonIdentity_1.duplicateExperienceMessage);
            item.isDuplicate = true;
        }
        seen.add(key);
    }
    for (const item of preview)
        item.isValid = item.errors.length === 0;
    const valid = preview.filter((p) => p.isValid).length;
    const invalid = preview.filter((p) => !p.isValid).length;
    return { total: rows.length, valid, invalid, preview, duplicates };
}
/**
 * 执行体验课导入
 */
async function executeExperiencesImport(data, organizationId, campusId, actorId) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const result = {
        success: true,
        summary: { total: data.length, created: 0, updated: 0, skipped: 0, failed: 0 },
        details: [],
    };
    // 获取教练映射
    const teacherNames = data.map((d) => d.teachingTeacherName).filter(Boolean);
    let teacherMap = {};
    if (teacherNames.length > 0) {
        const teachers = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['teacher', 'coach', 'manager'] },
            },
            select: { id: true, name: true },
        });
        teacherMap = (teachers || []).reduce((acc, t) => {
            acc[t.name] = t;
            return acc;
        }, {});
    }
    // 获取负责人映射
    const assigneeNames = data.map((d) => d.assigneeName).filter(Boolean);
    let assigneeMap = {};
    if (assigneeNames.length > 0) {
        const assignees = await database_1.default.user.findMany({
            where: {
                organizationId: organizationId,
                campusId: campusId,
                role: { in: ['admin', 'manager', 'sales', 'coach'] },
            },
            select: { id: true, name: true },
        });
        assigneeMap = (assignees || []).reduce((acc, u) => {
            acc[u.name] = u;
            return acc;
        }, {});
    }
    // 获取班级映射
    const classNames = data.map((d) => d.className).filter(Boolean);
    let classMap = {};
    if (classNames.length > 0) {
        const classes = await database_1.default.class.findMany({
            where: { organizationId: organizationId, status: { not: 'deleted' }, campusId: campusId },
            select: { id: true, name: true },
        });
        classMap = (classes || []).reduce((acc, c) => {
            acc[c.name] = c;
            return acc;
        }, {});
    }
    // 分批处理
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        for (const item of batch) {
            const rowIndex = i + batch.indexOf(item) + 2;
            try {
                const newExperience = {
                    studentName: item.studentName,
                    contact: item.contact,
                    organizationId,
                    assigneeId: actorId,
                    status: item.status || 'pending',
                };
                if (item.age !== undefined)
                    newExperience.age = item.age;
                if (item.source)
                    newExperience.source = item.source;
                if (item.scheduleDate)
                    newExperience.scheduleDate = item.scheduleDate;
                if (item.notes)
                    newExperience.notes = item.notes;
                // 设置班级
                if (item.className) {
                    if (!classMap[item.className])
                        throw new errorHandler_1.ApiError('导入指定的班级不可用', 409, 'CLASS_UNAVAILABLE');
                    newExperience.classId = classMap[item.className].id;
                    newExperience.className = item.className;
                }
                // 设置授课教练
                if (item.teachingTeacherName && teacherMap[item.teachingTeacherName]) {
                    newExperience.teachingTeacherId = teacherMap[item.teachingTeacherName].id;
                    newExperience.teachingTeacherName = item.teachingTeacherName;
                }
                // 设置负责人
                if (item.assigneeName && assigneeMap[item.assigneeName]) {
                    newExperience.assigneeId = assigneeMap[item.assigneeName].id;
                    newExperience.assigneeName = item.assigneeName;
                }
                await database_1.default.$transaction(async (tx) => {
                    await (0, scheduleConflicts_1.lockScheduleWrites)(tx, organizationId);
                    const assignee = await lockImportAssignee(tx, organizationId, campusId, newExperience.assigneeId);
                    newExperience.assigneeName = assignee.name;
                    await (0, experiencePersonIdentity_1.assertExperiencePersonAvailable)(tx, organizationId, { studentName: item.studentName, contact: item.contact });
                    if (newExperience.classId) {
                        const available = await tx.$queryRaw `SELECT id FROM classes WHERE id=${newExperience.classId}
              AND "organizationId"=${organizationId} AND "campusId"=${campusId} AND status <> 'deleted' FOR KEY SHARE`;
                        if (!available.length)
                            throw new errorHandler_1.ApiError('导入指定的班级不可用', 409, 'CLASS_UNAVAILABLE');
                    }
                    await tx.experienceLesson.create({
                        data: newExperience,
                    });
                });
                result.summary.created++;
                result.details.push({ row: rowIndex, status: 'created', message: '体验课创建成功' });
            }
            catch (err) {
                result.summary.failed++;
                result.details.push({
                    row: rowIndex,
                    status: 'failed',
                    ...(err instanceof errorHandler_1.ApiError ? { code: err.code } : {}),
                    message: `处理异常: ${err.message}`,
                });
            }
        }
    }
    if (result.summary.failed > 0 && result.summary.created === 0) {
        result.success = false;
    }
    return result;
}
exports.importService = {
    parseExcelFile,
    generateStudentTemplate,
    generateClassTemplate,
    generateLeadTemplate,
    generateExperienceTemplate,
    previewStudents,
    previewClasses,
    previewLeads,
    previewExperiences,
    executeStudentsImport,
    executeClassesImport,
    executeLeadsImport,
    executeExperiencesImport,
};
//# sourceMappingURL=importService.js.map