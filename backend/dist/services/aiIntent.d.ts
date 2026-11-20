import type { ChatMessage } from './aiService';
/**
 * G2 意图解析：模型无原生 tool calling → 严格 JSON 意图协议 + 服务端调度。
 * - 意图阶段为独立模型调用（成本并入同一账单）。
 * - 只输出 JSON：{reply} 或 {tools:[{name,params}]}；解析失败按直接回答处理（不猜）。
 * - 模型只能选择白名单工具名与参数，绝不生成 SQL/shell。
 */
export type BusinessPurpose = 'facts' | 'comparison' | 'advice' | 'report' | 'mixed';
export interface BusinessTimeIntent {
    observation?: string;
    target?: string;
    comparison?: string;
    asOf?: string;
}
export declare const BUSINESS_SUBJECTS: readonly ["teacher", "compensation", "student", "class", "sales", "attendance", "finance", "campus", "operations", "attachment", "other"];
export interface AiIntent {
    entities?: {
        campus?: string;
        student?: string;
        teacher?: string;
    };
    presentation?: 'table' | 'text';
    purpose?: BusinessPurpose;
    subject?: (typeof BUSINESS_SUBJECTS)[number];
    metrics?: string[];
    actionIds?: string[];
    groupBy?: string[];
    timeIntent?: BusinessTimeIntent;
    /** R2：模型输出是否为可解析 JSON（合法 {tools:[]} 也算 true；纯文本/坏 JSON 为 false）。
     *  false 时路由按"意图失败"明确处理，不降级为正文自由回答。 */
    parsedOk?: boolean;
    /** 无需数据的直接回答（寒暄/拒答/危险请求拒绝说明） */
    reply?: string;
    /** 计划的工具调用（白名单校验后执行） */
    tools?: Array<{
        name: string;
        params: Record<string, unknown>;
    }>;
    /** 用户要求生成报告文件（Excel/周报文件）——路由侧据实创建文件任务 */
    fileRequested?: boolean;
    fileTool?: string;
    fileFormats?: Array<'xlsx' | 'docx'>;
    reuseSnapshot?: boolean;
}
export declare const INTENT_MARKER = "\u3010\u610F\u56FE\u89E3\u6790\u3011";
export interface IntentContext {
    /** 有界近期历史（服务端窗口产出，最新在尾） */
    history?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    /** 已压缩摘要（不可信背景，仅供指代消解） */
    summary?: string | null;
    /** 上海时区今天（YYYY-MM-DD）——相对日期（"上个月"）的唯一锚点 */
    today?: string;
    attachments?: string;
}
/** 意图阶段消息（独立调用，不进入会话历史持久化）。
 *  R1-2：意图是唯一决定工具与日期的阶段，必须与回答阶段同等地看到
 *  有界历史/摘要/服务端当前日期，否则"刚才那个班/改成上个月"无从解析。 */
export declare function buildIntentMessages(question: string, ctx?: IntentContext): ChatMessage[];
/** 提取 JSON；解析失败交由路由处理。 */
export declare function parseIntent(raw: string): AiIntent;
/** 证据注入消息（回答阶段作为 system 消息，明确数字只来自证据） */
export declare function buildEvidenceMessages(evidences: Array<{
    modelText: string;
    title: string;
    tool: string;
    caliber?: string;
    unit?: string;
    timeRange?: unknown;
    missing?: string[];
    filters?: Record<string, unknown>;
}>, budgetChars?: number): ChatMessage[];
/**
 * R2-4：叙述数字核验（机制而非提示词）。提取回答文本中的数字（≥3 位整数或小数），
 * 与证据 modelText 中出现的数字集合比对；不在证据中的数字列为警告
 * （前端标黄"以下数字未在证据中找到"）。百分比/序号等短数字不比对（≤2 位）。
 */
export declare function verifyNumbersAgainstEvidence(answerText: string, evidenceTexts: string[]): string[];
//# sourceMappingURL=aiIntent.d.ts.map