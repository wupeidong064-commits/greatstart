import { ChatMessage } from './aiService';
/**
 * AI 会话记忆服务（G1）
 *
 * 职责：
 * - 会话 CRUD（仅本人）：新建/列出/恢复/重命名/删除（软删）
 * - 消息持久化：requestId 幂等（同键不双任务不双扣）、sequence 并发锁
 * - 上下文窗口：总输入预算 12k token，其中历史+摘要 ≤6k；近期优先保留约 6 轮，
 *   在预算内从尾部动态裁剪（按消息整条取舍，不机械切字符串）
 * - 压缩摘要：达到预算才生成；摘要 ≤800 token；带 coveredThroughMessageId/版本，增量更新；
 *   失败退回有界近期历史并标记失败次数（防压缩死循环）
 *
 * token 估算：中文按 ~1 token/字符 的保守估计（产品预算，不声称模型分词精确值）。
 */
export interface ConversationOwner {
    userId: string;
    organizationId: string;
    campusId: string | null;
}
export declare const CTX_BUDGET: {
    total: number;
    historyMax: number;
    evidenceMax: number;
    recentTurns: number;
    summaryMax: number;
    maxMessageChars: number;
};
export declare const estimateTokens: (text: string) => number;
export declare function createConversation(owner: ConversationOwner, title?: string): Promise<{
    id: string;
    title: string | null;
}>;
export declare function listConversations(owner: ConversationOwner): Promise<Array<{
    id: string;
    title: string | null;
    updatedAt: Date;
}>>;
export declare function getOwnedConversation(owner: ConversationOwner, conversationId: string): Promise<{
    id: string;
    organizationId: string;
    campusId: string | null;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    title: string | null;
    ownerUserId: string;
    contextSummary: string | null;
    summaryCoveredThroughMessageId: string | null;
    summaryVersion: number;
    summaryFailedAttempts: number;
}>;
export declare function renameConversation(owner: ConversationOwner, conversationId: string, title: string): Promise<void>;
/** 软删除：消息随之不再可见；审计与消费记录不受影响 */
export declare function deleteConversation(owner: ConversationOwner, conversationId: string): Promise<void>;
export interface AppendResult {
    message: {
        id: string;
        sequence: number;
        role: string;
        content: string;
        status: string;
        requestId: string | null;
    };
    /** true = 命中幂等（同 requestId 已存在，未新建消息） */
    idempotentHit: boolean;
}
/** 幂等追加用户消息：同 requestId 直接返回已有消息（不新建、不双扣） */
export declare function appendUserMessageIdempotent(owner: ConversationOwner, conversationId: string, content: string, requestId: string): Promise<AppendResult>;
/** 会话内是否已有进行中的流式任务（并发锁：同会话一次只允许一个进行中任务） */
export declare function hasActiveRun(conversationId: string): Promise<boolean>;
export interface ContextWindow {
    history: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    summaryText: string | null;
    /** 历史被裁剪掉的消息数（不含摘要已覆盖部分） */
    droppedCount: number;
    /** 需要生成/更新摘要（被裁剪内容未纳入摘要） */
    needsSummary: boolean;
    /** 摘要需要覆盖到的消息 id（exclusive） */
    summaryUpToId: string | null;
    tokens: {
        history: number;
        summary: number;
    };
    truncated: boolean;
}
export declare function buildContextWindow(rows: Array<{
    id: string;
    sequence: number;
    role: string;
    content: string;
    status: string;
}>, summary: {
    text: string | null;
    coveredThroughMessageId: string | null;
    version: number;
} | null): ContextWindow;
export interface SummaryModelCaller {
    (messages: ChatMessage[]): Promise<{
        text: string;
        usage: {
            promptTokens: number;
            completionTokens: number;
        };
    }>;
}
/** 增量更新摘要：旧摘要 + covered..cutoff 之间的消息 → 新摘要 */
export declare function updateSummary(owner: ConversationOwner, conversationId: string, cutoffMessageId: string, callModel: SummaryModelCaller): Promise<{
    ok: boolean;
    used: boolean;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}>;
/** 防死循环：摘要连续失败 ≥2 次后暂停压缩尝试（退回有界近期历史并提示历史范围缩短） */
export declare function summarySuppressed(conversationId: string): Promise<boolean>;
//# sourceMappingURL=conversationService.d.ts.map