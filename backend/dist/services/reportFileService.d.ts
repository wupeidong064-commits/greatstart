/**
 * G3 步骤3：AI 报告文件服务（Excel 周报）
 * - 任务表 ai_report_files；requestId 幂等：同键返回原任务（不双建不双扣）
 * - 数字只来自服务端证据快照 (weekly_report_data 证据卡)，模型不参与任何数字
 * - xlsx 由固定代码生成器产出（类型化单元格：日期=日期，数值=数值）
 * - 文件落盘 backend/storage/ai-reports/<id>.xlsx；下载走服务端鉴权路由
 * - 重复下载不消费；排版失败重试复用分析快照，不再调用模型
 */
export interface ReportFileOwner {
    userId: string;
    organizationId: string;
    campusId: string | null;
}
/** 报告文件目录：可经 AI_REPORTS_DIR 指向本轮隔离目录（默认共享 backend/storage/ai-reports） */
export declare const REPORT_FILE_DIR: string;
/** 从自然语言解析周/月期间（上海时区；周=周一至周日）。显式日期由意图参数优先。 */
export declare function parsePeriodFromText(text: string, today: string): {
    start: string;
    end: string;
};
export interface CreateReportFileInput {
    requestId: string;
    conversationId: string | null;
    messageId: string | null;
    billId: string | null;
    title: string;
    periodStart: string;
    periodEnd: string;
    paramsJson: Record<string, unknown>;
    evidenceJson: Record<string, unknown>[];
}
/** 同 requestId 返回原任务（不双建）；新键建 processing 任务 */
export declare function createOrGetReportFileTask(owner: ReportFileOwner, input: CreateReportFileInput): Promise<{
    id: string;
    duplicate: boolean;
    status: string;
}>;
/** 读回任务并生成 xlsx：成功→ready 落盘；失败→failed+error */
export declare function generateReportFile(taskId: string): Promise<{
    status: string;
    error?: string;
}>;
export declare function getReportFileForActor(actor: ReportFileOwner, id: string): Promise<{
    error: string | null;
    id: string;
    organizationId: string;
    campusId: string | null;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    requestId: string;
    createdById: string;
    title: string;
    billId: string | null;
    conversationId: string | null;
    messageId: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    paramsJson: import("@prisma/client/runtime/library").JsonValue | null;
    evidenceJson: import("@prisma/client/runtime/library").JsonValue | null;
    fileName: string | null;
    filePath: string | null;
    fileHash: string | null;
    downloadCount: number;
}>;
/** 失败/文件丢失重试：复用分析快照重新排版，不调用模型、不新增账单 */
export declare function retryReportFile(actor: ReportFileOwner, id: string): Promise<{
    status: string;
    error?: string;
}>;
/** 文件卡（SSE/消息/前端共用的形状） */
export declare function buildFileCard(row: {
    id: string;
    status: string;
    error?: string | null;
    title: string;
    fileName?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
}): {
    type: string;
    tool: string;
    title: string;
    status: string;
    fileId: string;
    fileName: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    downloadUrl: string | null;
    error: string | null;
};
/** Read and verify the exact bytes of this immutable task before sending any response. */
export declare function verifiedReportFileBuffer(row: {
    id: string;
    filePath: string | null;
    fileHash: string | null;
}): Buffer;
//# sourceMappingURL=reportFileService.d.ts.map