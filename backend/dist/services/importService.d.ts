/**
 * 批量导入服务层
 * 处理 Excel 解析、数据验证、批量导入等核心逻辑
 */
export type ImportType = 'students' | 'classes' | 'leads' | 'experiences';
export type DuplicateStrategy = 'skip' | 'update';
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
    code?: string;
    message?: string;
    data?: Record<string, any>;
}
/**
 * 解析 Excel 文件
 */
export declare function parseExcelFile(buffer: Buffer): Record<string, any>[];
/**
 * 生成学员导入模板
 */
export declare function generateStudentTemplate(): Buffer;
/**
 * 生成班级导入模板
 */
export declare function generateClassTemplate(): Buffer;
/**
 * 生成鱼池（线索）导入模板
 */
export declare function generateLeadTemplate(): Buffer;
/**
 * 生成体验课导入模板
 */
export declare function generateExperienceTemplate(): Buffer;
/**
 * 预览学员导入数据
 */
export declare function previewStudents(buffer: Buffer, organizationId: string, campusId?: string): Promise<PreviewResult>;
/**
 * 预览班级导入数据
 */
export declare function previewClasses(buffer: Buffer, organizationId: string, campusId?: string): Promise<PreviewResult>;
/**
 * 执行学员导入
 */
export declare function executeStudentsImport(data: Record<string, any>[], organizationId: string, campusId: string | undefined, duplicateStrategy: DuplicateStrategy, duplicates: DuplicateItem[]): Promise<ImportResult>;
/**
 * 执行班级导入
 */
export declare function executeClassesImport(data: Record<string, any>[], organizationId: string, campusId: string | undefined, duplicateStrategy: DuplicateStrategy, duplicates: DuplicateItem[]): Promise<ImportResult>;
/**
 * 预览鱼池（线索）导入数据
 */
export declare function previewLeads(buffer: Buffer, organizationId: string, campusId?: string): Promise<PreviewResult>;
/**
 * 执行鱼池（线索）导入
 */
export declare function executeLeadsImport(data: Record<string, any>[], organizationId: string, duplicateStrategy: DuplicateStrategy, duplicates: DuplicateItem[], campusId?: string, actorId?: string): Promise<ImportResult>;
/**
 * 预览体验课导入数据
 */
export declare function previewExperiences(buffer: Buffer, organizationId: string, campusId?: string): Promise<PreviewResult>;
/**
 * 执行体验课导入
 */
export declare function executeExperiencesImport(data: Record<string, any>[], organizationId: string, campusId?: string, actorId?: string): Promise<ImportResult>;
export declare const importService: {
    parseExcelFile: typeof parseExcelFile;
    generateStudentTemplate: typeof generateStudentTemplate;
    generateClassTemplate: typeof generateClassTemplate;
    generateLeadTemplate: typeof generateLeadTemplate;
    generateExperienceTemplate: typeof generateExperienceTemplate;
    previewStudents: typeof previewStudents;
    previewClasses: typeof previewClasses;
    previewLeads: typeof previewLeads;
    previewExperiences: typeof previewExperiences;
    executeStudentsImport: typeof executeStudentsImport;
    executeClassesImport: typeof executeClassesImport;
    executeLeadsImport: typeof executeLeadsImport;
    executeExperiencesImport: typeof executeExperiencesImport;
};
//# sourceMappingURL=importService.d.ts.map