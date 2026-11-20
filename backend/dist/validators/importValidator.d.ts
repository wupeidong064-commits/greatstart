/**
 * 批量导入数据验证器
 */
/**
 * 根据出生日期计算年龄（每年1月1日自动更新）
 * @param birthDate 出生日期 YYYY-MM-DD 格式
 * @returns 年龄
 */
export declare function calculateAge(birthDate: string): number;
/**
 * 解析并规范化日期字符串
 * 支持多种格式：YYYY-MM-DD, YYYY/MM/DD, M/D/YYYY, Excel 序列号等
 * 使用 UTC 方法避免时区转换导致的日期偏移
 */
export declare function parseDate(value: any): string | null;
/**
 * 验证日期字符串是否有效
 */
export declare function isValidDate(value: any): boolean;
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
export interface StudentImportRow {
    row: number;
    name?: string;
    gender?: string;
    age?: string;
    phone?: string;
    parentName?: string;
    parentPhone?: string;
    parentEmail?: string;
    className?: string;
    teacherName?: string;
    purchasedLessons?: string;
    consumedLessons?: string;
    remainingLessons?: string;
    totalPayment?: string;
    salesName?: string;
    notes?: string;
}
export interface ClassImportRow {
    row: number;
    name?: string;
    courseType?: string;
    level?: string;
    capacity?: string;
    teacherName?: string;
    status?: string;
}
export interface LeadImportRow {
    row: number;
    customerName?: string;
    age?: string;
    contact?: string;
    notes?: string;
    lastContactAt?: string;
    assigneeName?: string;
}
export interface ExperienceImportRow {
    row: number;
    studentName?: string;
    age?: string;
    contact?: string;
    source?: string;
    className?: string;
    scheduleDate?: string;
    teachingTeacherName?: string;
    assigneeName?: string;
    status?: string;
    notes?: string;
}
/**
 * 验证学员导入数据
 */
export declare function validateStudentRow(row: StudentImportRow): ValidationResult;
/**
 * 验证班级导入数据
 */
export declare function validateClassRow(row: ClassImportRow): ValidationResult;
/**
 * 规范化学员数据（转换格式、处理默认值）
 */
export declare function normalizeStudentRow(row: StudentImportRow): Record<string, any>;
/**
 * 规范化班级数据（转换格式、处理默认值）
 */
export declare function normalizeClassRow(row: ClassImportRow): Record<string, any>;
/**
 * Excel 列名映射（中文 -> 英文字段名）
 */
export declare const STUDENT_COLUMN_MAPPING: Record<string, string>;
export declare const CLASS_COLUMN_MAPPING: Record<string, string>;
export declare const LEAD_COLUMN_MAPPING: Record<string, string>;
export declare const EXPERIENCE_COLUMN_MAPPING: Record<string, string>;
/**
 * 验证鱼池（线索）导入数据
 */
export declare function validateLeadRow(row: LeadImportRow): ValidationResult;
/**
 * 验证体验课导入数据
 */
export declare function validateExperienceRow(row: ExperienceImportRow): ValidationResult;
/**
 * 规范化鱼池（线索）数据
 */
export declare function normalizeLeadRow(row: LeadImportRow): Record<string, any>;
/**
 * 规范化体验课数据
 */
export declare function normalizeExperienceRow(row: ExperienceImportRow): Record<string, any>;
/**
 * 将 Excel 行数据映射到字段名
 */
export declare function mapRowToFields(row: Record<string, any>, mapping: Record<string, string>): Record<string, any>;
//# sourceMappingURL=importValidator.d.ts.map