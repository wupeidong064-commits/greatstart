export declare const activeAiModel: () => string;
export interface OrgSnapshot {
    organizationId: string;
    generatedAt: string;
    activeClasses: number | null;
    activeStudents: number | null;
    monthOrderCount: number | null;
    monthOrderAmount: number | null;
    monthNewOrderCount: number | null;
    monthRenewalOrderCount: number | null;
    lowAttendanceStudents: number | null;
    lowAttendanceDays: number;
    lowAttendanceThreshold: number;
    errors: string[];
}
export declare const LOW_ATTENDANCE_DEFAULT_DAYS = 30;
export declare const LOW_ATTENDANCE_DEFAULT_THRESHOLD = 60;
export declare function invalidateOrgSnapshot(organizationId: string): void;
export declare function buildOrgSnapshot(organizationId: string, opts?: {
    force?: boolean;
    campusId?: string | null;
}): Promise<OrgSnapshot>;
export declare function invalidateSnapshotCache(organizationId?: string): void;
export declare function renderSnapshotText(snapshot: OrgSnapshot): string;
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export declare function isAiConfigured(): boolean;
/** 当前供应商标签（审计/费用说明用） */
export declare function activeAiProviderLabel(): string;
export declare const ROLE_LABELS: Record<string, string>;
export declare function buildSystemPrompt(snapshot: OrgSnapshot | null, userName?: string, userRole?: string): string;
/**
 * 调用模型流式对话。AI_PROVIDER=mock 时走本地录制样本（零网络、零费用），
 * 供验收/回归使用；mock 回复内容确定性（引用最后一条用户消息+历史轮数），
 * 绝不伪装成真实模型能力，usage 为合成值并如实标记。
 */
export declare function streamGlmChat(messages: ChatMessage[], signal?: AbortSignal, opts?: {
    maxTokens?: number;
    onUsage?: (u: {
        promptTokens: number;
        completionTokens: number;
        actualModel?: string;
        details?: Record<string, unknown>;
    }) => void;
}): AsyncGenerator<string, void, unknown>;
//# sourceMappingURL=aiService.d.ts.map