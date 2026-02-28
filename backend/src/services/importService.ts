/**
 * 批量导入服务层
 * 处理 Excel 解析、数据验证、批量导入等核心逻辑
 */

import * as XLSX from 'xlsx';
import { memfireAdmin } from '../config/memfire';
import {
  validateStudentRow,
  validateClassRow,
  normalizeStudentRow,
  normalizeClassRow,
  mapRowToFields,
  STUDENT_COLUMN_MAPPING,
  CLASS_COLUMN_MAPPING,
  StudentImportRow,
  ClassImportRow,
} from '../validators/importValidator';

// 导入类型
export type ImportType = 'students' | 'classes';

// 重复处理策略
export type DuplicateStrategy = 'skip' | 'update';

// 预览结果
export interface PreviewResult {
  total: number;
  valid: number;
  invalid: number;
  preview: PreviewItem[];
  duplicates: DuplicateItem[];
}

export interface PreviewItem {
  row: number;
  data: Record<string, any>;
  isValid: boolean;
  errors: string[];
  isDuplicate?: boolean;
}

export interface DuplicateItem {
  row: number;
  data: Record<string, any>;
  existingRecord: Record<string, any>;
}

// 导入结果
export interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  details: ImportDetail[];
}

export interface ImportDetail {
  row: number;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  message?: string;
  data?: Record<string, any>;
}

// 批量导入配置
const MAX_ROWS = 1000;
const BATCH_SIZE = 50;

/**
 * 解析 Excel 文件
 */
export function parseExcelFile(buffer: Buffer): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('Excel 文件没有工作表');
  }

  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

  return data;
}

/**
 * 生成学员导入模板
 */
export function generateStudentTemplate(): Buffer {
  const headers = [
    '学员姓名',
    '性别',
    '出生日期',
    '联系电话',
    '家长姓名',
    '家长电话',
    '家长邮箱',
    '所属班级编码',
    '剩余课时',
    '备注',
  ];

  const exampleData = [
    ['张三', 'M', '2015-03-20', '13800138000', '张父', '13900139000', 'parent@example.com', 'A001', '20', '试听课学员'],
    ['李四', 'F', '2016-05-10', '13800138001', '李母', '13900139001', '', 'A002', '15', ''],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 12 }, // 学员姓名
    { wch: 6 },  // 性别
    { wch: 12 }, // 出生日期
    { wch: 14 }, // 联系电话
    { wch: 10 }, // 家长姓名
    { wch: 14 }, // 家长电话
    { wch: 20 }, // 家长邮箱
    { wch: 14 }, // 所属班级编码
    { wch: 10 }, // 剩余课时
    { wch: 20 }, // 备注
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '学员导入模板');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 生成班级导入模板
 */
export function generateClassTemplate(): Buffer {
  const headers = [
    '班级名称',
    '班级编码',
    '课程类型',
    '班级水平',
    '容量',
    '负责教练',
    '状态',
  ];

  const exampleData = [
    ['周一基础班', 'A001', '篮球基础', '第一阶段', '20', '李教练', 'active'],
    ['周三进阶班', 'A002', '篮球进阶', '第二阶段', '15', '王教练', 'active'],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 15 }, // 班级名称
    { wch: 12 }, // 班级编码
    { wch: 12 }, // 课程类型
    { wch: 10 }, // 班级水平
    { wch: 8 },  // 容量
    { wch: 10 }, // 负责教练
    { wch: 10 }, // 状态
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '班级导入模板');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 预览学员导入数据
 */
export async function previewStudents(
  buffer: Buffer,
  organizationId: string,
  campusId?: string
): Promise<PreviewResult> {
  const rows = parseExcelFile(buffer);

  if (rows.length === 0) {
    throw new Error('Excel 文件没有数据');
  }

  if (rows.length > MAX_ROWS) {
    throw new Error(`单次导入最多支持 ${MAX_ROWS} 行数据`);
  }

  const preview: PreviewItem[] = [];
  const duplicates: DuplicateItem[] = [];

  // 获取所有家长电话，用于检查重复
  const parentPhones = rows
    .map((row, index) => {
      const mapped = mapRowToFields(row, STUDENT_COLUMN_MAPPING);
      return mapped.parentPhone;
    })
    .filter(Boolean);

  // 批量查询已有的学员（按家长电话）
  let existingStudentsMap: Record<string, any> = {};
  if (parentPhones.length > 0) {
    const { data: existingStudents } = await memfireAdmin
      .from('students')
      .select('*')
      .eq('organizationId', organizationId)
      .in('parentPhone', parentPhones);

    existingStudentsMap = (existingStudents || []).reduce((acc: Record<string, any>, s: any) => {
      if (s.parentPhone) {
        acc[s.parentPhone] = s;
      }
      return acc;
    }, {});
  }

  // 获取所有班级编码，用于验证
  const classCodes = rows
    .map((row) => {
      const mapped = mapRowToFields(row, STUDENT_COLUMN_MAPPING);
      return mapped.classCode;
    })
    .filter(Boolean);

  let existingClassesMap: Record<string, any> = {};
  if (classCodes.length > 0) {
    const { data: existingClasses } = await memfireAdmin
      .from('classes')
      .select('id, code, name')
      .eq('organizationId', organizationId)
      .in('code', classCodes);

    existingClassesMap = (existingClasses || []).reduce((acc: Record<string, any>, c: any) => {
      acc[c.code] = c;
      return acc;
    }, {});
  }

  // 验证每一行数据
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mapped = mapRowToFields(row, STUDENT_COLUMN_MAPPING);
    const rowData: StudentImportRow = { row: i + 2, ...mapped }; // +2 因为 Excel 行号从 1 开始，且有表头

    const validation = validateStudentRow(rowData);
    const normalized = normalizeStudentRow(rowData);

    const item: PreviewItem = {
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

    // 检查班级编码是否存在（仅警告，不阻止导入）
    if (normalized.classCode && !existingClassesMap[normalized.classCode]) {
      item.errors.push(`班级编码 "${normalized.classCode}" 不存在，将自动创建`);
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
export async function previewClasses(
  buffer: Buffer,
  organizationId: string,
  campusId?: string
): Promise<PreviewResult> {
  const rows = parseExcelFile(buffer);

  if (rows.length === 0) {
    throw new Error('Excel 文件没有数据');
  }

  if (rows.length > MAX_ROWS) {
    throw new Error(`单次导入最多支持 ${MAX_ROWS} 行数据`);
  }

  const preview: PreviewItem[] = [];
  const duplicates: DuplicateItem[] = [];

  // 获取所有班级编码，用于检查重复
  const classCodes = rows
    .map((row) => {
      const mapped = mapRowToFields(row, CLASS_COLUMN_MAPPING);
      return mapped.code;
    })
    .filter(Boolean);

  // 批量查询已有的班级（按编码）
  let existingClassesMap: Record<string, any> = {};
  if (classCodes.length > 0) {
    const { data: existingClasses } = await memfireAdmin
      .from('classes')
      .select('*')
      .eq('organizationId', organizationId)
      .in('code', classCodes);

    existingClassesMap = (existingClasses || []).reduce((acc: Record<string, any>, c: any) => {
      acc[c.code] = c;
      return acc;
    }, {});
  }

  // 获取所有教练姓名，用于验证
  const teacherNames = rows
    .map((row) => {
      const mapped = mapRowToFields(row, CLASS_COLUMN_MAPPING);
      return mapped.teacherName;
    })
    .filter(Boolean);

  let teachersMap: Record<string, any> = {};
  if (teacherNames.length > 0) {
    const { data: teachers } = await memfireAdmin
      .from('users')
      .select('id, name')
      .eq('organizationId', organizationId)
      .in('role', ['teacher', 'coach']);

    teachersMap = (teachers || []).reduce((acc: Record<string, any>, t: any) => {
      acc[t.name] = t;
      return acc;
    }, {});
  }

  // 验证每一行数据
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mapped = mapRowToFields(row, CLASS_COLUMN_MAPPING);
    const rowData: ClassImportRow = { row: i + 2, ...mapped };

    const validation = validateClassRow(rowData);
    const normalized = normalizeClassRow(rowData);

    const item: PreviewItem = {
      row: i + 2,
      data: normalized,
      isValid: validation.isValid,
      errors: validation.errors,
    };

    // 检查重复（按编码）
    if (normalized.code && existingClassesMap[normalized.code]) {
      item.isDuplicate = true;
      duplicates.push({
        row: i + 2,
        data: normalized,
        existingRecord: existingClassesMap[normalized.code],
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
export async function executeStudentsImport(
  data: Record<string, any>[],
  organizationId: string,
  campusId: string | undefined,
  duplicateStrategy: DuplicateStrategy,
  createMissingClasses: boolean,
  duplicates: DuplicateItem[]
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    summary: { total: data.length, created: 0, updated: 0, skipped: 0, failed: 0 },
    details: [],
  };

  // 构建重复数据映射（用于快速查找）
  const duplicateMap = new Map<string, any>();
  for (const dup of duplicates) {
    if (dup.data.parentPhone) {
      duplicateMap.set(dup.data.parentPhone, dup.existingRecord);
    }
  }

  // 获取班级编码映射
  const classCodes = data.map((d) => d.classCode).filter(Boolean);
  let classesMap: Record<string, any> = {};
  if (classCodes.length > 0) {
    const { data: existingClasses } = await memfireAdmin
      .from('classes')
      .select('id, code')
      .eq('organizationId', organizationId)
      .in('code', classCodes);

    classesMap = (existingClasses || []).reduce((acc: Record<string, any>, c: any) => {
      acc[c.code] = c;
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

          // 更新现有记录
          const updateData: Record<string, any> = {};
          if (item.name) updateData.name = item.name;
          if (item.gender) updateData.gender = item.gender;
          if (item.birthDate) updateData.birthDate = item.birthDate;
          if (item.phone) updateData.phone = item.phone;
          if (item.parentName) updateData.parentName = item.parentName;
          if (item.parentEmail) updateData.parentEmail = item.parentEmail;
          if (item.remainingLessons !== undefined) updateData.remainingLessons = item.remainingLessons;
          if (item.notes) updateData.notes = item.notes;

          const { error } = await memfireAdmin
            .from('students')
            .update(updateData)
            .eq('id', existingRecord.id);

          if (error) {
            result.summary.failed++;
            result.details.push({
              row: rowIndex,
              status: 'failed',
              message: `更新失败: ${error.message}`,
              data: item,
            });
            continue;
          }

          result.summary.updated++;
          result.details.push({
            row: rowIndex,
            status: 'updated',
            message: '学员更新成功',
            data: item,
          });
        } else {
          // 创建新记录
          const newStudent: Record<string, any> = {
            name: item.name,
            organizationId,
            campusId: campusId || null,
            status: 'active',
          };

          if (item.gender) newStudent.gender = item.gender;
          if (item.birthDate) newStudent.birthDate = item.birthDate;
          if (item.phone) newStudent.phone = item.phone;
          if (item.parentName) newStudent.parentName = item.parentName;
          if (item.parentPhone) newStudent.parentPhone = item.parentPhone;
          if (item.parentEmail) newStudent.parentEmail = item.parentEmail;
          if (item.remainingLessons !== undefined) newStudent.remainingLessons = item.remainingLessons;
          if (item.notes) newStudent.notes = item.notes;

          const { data: created, error } = await memfireAdmin
            .from('students')
            .insert(newStudent)
            .select()
            .single();

          if (error) {
            result.summary.failed++;
            result.details.push({
              row: rowIndex,
              status: 'failed',
              message: `创建失败: ${error.message}`,
              data: item,
            });
            continue;
          }

          // 如果有班级编码，创建报名记录
          if (item.classCode && created) {
            let classId = classesMap[item.classCode]?.id;

            // 如果班级不存在且允许创建
            if (!classId && createMissingClasses) {
              const { data: newClass, error: classError } = await memfireAdmin
                .from('classes')
                .insert({
                  name: `班级-${item.classCode}`,
                  code: item.classCode,
                  courseType: '待定',
                  organizationId,
                  campusId: campusId || null,
                  capacity: 20,
                  status: 'active',
                })
                .select()
                .single();

              if (!classError && newClass) {
                classId = newClass.id;
                classesMap[item.classCode] = newClass;
              }
            }

            if (classId) {
              await memfireAdmin.from('enrollments').insert({
                studentId: created.id,
                classId,
                organizationId,
                status: 'active',
              });
            }
          }

          result.summary.created++;
          result.details.push({
            row: rowIndex,
            status: 'created',
            message: '学员创建成功',
            data: item,
          });
        }
      } catch (err: any) {
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
export async function executeClassesImport(
  data: Record<string, any>[],
  organizationId: string,
  campusId: string | undefined,
  duplicateStrategy: DuplicateStrategy,
  duplicates: DuplicateItem[]
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    summary: { total: data.length, created: 0, updated: 0, skipped: 0, failed: 0 },
    details: [],
  };

  // 构建重复数据映射
  const duplicateMap = new Map<string, any>();
  for (const dup of duplicates) {
    if (dup.data.code) {
      duplicateMap.set(dup.data.code, dup.existingRecord);
    }
  }

  // 获取教练映射
  const teacherNames = data.map((d) => d.teacherName).filter(Boolean);
  let teachersMap: Record<string, any> = {};
  if (teacherNames.length > 0) {
    const { data: teachers } = await memfireAdmin
      .from('users')
      .select('id, name')
      .eq('organizationId', organizationId)
      .in('role', ['teacher', 'coach']);

    teachersMap = (teachers || []).reduce((acc: Record<string, any>, t: any) => {
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
        const existingRecord = duplicateMap.get(item.code);

        if (existingRecord) {
          if (duplicateStrategy === 'skip') {
            result.summary.skipped++;
            result.details.push({
              row: rowIndex,
              status: 'skipped',
              message: `班级已存在（编码: ${item.code}）`,
              data: item,
            });
            continue;
          }

          // 更新现有记录
          const updateData: Record<string, any> = {};
          if (item.name) updateData.name = item.name;
          if (item.courseType) updateData.courseType = item.courseType;
          if (item.level) updateData.level = item.level;
          if (item.capacity) updateData.capacity = item.capacity;
          if (item.status) updateData.status = item.status;

          // 更新教练
          if (item.teacherName && teachersMap[item.teacherName]) {
            updateData.teacherId = teachersMap[item.teacherName].id;
          }

          const { error } = await memfireAdmin
            .from('classes')
            .update(updateData)
            .eq('id', existingRecord.id);

          if (error) {
            result.summary.failed++;
            result.details.push({
              row: rowIndex,
              status: 'failed',
              message: `更新失败: ${error.message}`,
              data: item,
            });
            continue;
          }

          result.summary.updated++;
          result.details.push({
            row: rowIndex,
            status: 'updated',
            message: '班级更新成功',
            data: item,
          });
        } else {
          // 创建新记录
          const newClass: Record<string, any> = {
            name: item.name,
            code: item.code,
            courseType: item.courseType,
            organizationId,
            campusId: campusId || null,
            capacity: item.capacity || 20,
            status: item.status || 'active',
          };

          if (item.level) newClass.level = item.level;

          // 设置教练
          if (item.teacherName && teachersMap[item.teacherName]) {
            newClass.teacherId = teachersMap[item.teacherName].id;
          }

          const { error } = await memfireAdmin
            .from('classes')
            .insert(newClass)
            .select()
            .single();

          if (error) {
            result.summary.failed++;
            result.details.push({
              row: rowIndex,
              status: 'failed',
              message: `创建失败: ${error.message}`,
              data: item,
            });
            continue;
          }

          result.summary.created++;
          result.details.push({
            row: rowIndex,
            status: 'created',
            message: '班级创建成功',
            data: item,
          });
        }
      } catch (err: any) {
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

export const importService = {
  parseExcelFile,
  generateStudentTemplate,
  generateClassTemplate,
  previewStudents,
  previewClasses,
  executeStudentsImport,
  executeClassesImport,
};
