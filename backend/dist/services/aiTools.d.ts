/**
 * AI 受控业务查询工具注册表（G2）
 *
 * 原则：
 * - 工具是白名单枚举；模型只能选择工具名与参数，不能生成 SQL/shell/直接写库。
 * - 所有查询经本注册表统一加范围（organizationId + 校区归属），复用与业务页一致的口径。
 * - 每次返回 evidence 信封：evidenceId、数据源、时间范围、生成时间、过滤条件、单位、
 *   口径说明、缺失字段；核心数字由代码计算（合计不由模型算）。
 * - 行级个人信息（电话）默认遮蔽；行数与发送给模型的体积受限。
 */
export declare const TOOL_LOOP_LIMIT = 4;
export interface EvidenceCard {
    evidenceId: string;
    tool: string;
    title: string;
    unit: string;
    caliber: string;
    timeRange: {
        start: string;
        end: string;
    } | null;
    generatedAt: string;
    businessAsOf?: string;
    filters: Record<string, unknown>;
    missing: string[];
    columns: Array<{
        key: string;
        label: string;
    }>;
    rows: Array<Record<string, unknown>>;
    totals: Record<string, number | string | null>;
    error: string | null;
}
export interface Evidence extends EvidenceCard {
    /** 发送给模型的紧凑文本（≤证据预算） */
    modelText: string;
}
export interface ToolContext {
    organizationId: string;
    campusId: string | null;
    /** 上海时区今天（YYYY-MM-DD） */
    today: string;
    userId?: string;
    signal?: AbortSignal;
}
type ParamDef = {
    type: 'string' | 'date' | 'number';
    required?: boolean;
    max?: number;
    enum?: readonly string[];
};
/** 遮蔽电话：保留前3后2 */
export declare function maskPhone(p?: string | null): string;
type ToolFn = (ctx: ToolContext, params: Record<string, unknown>) => Promise<Evidence>;
export interface ToolDef {
    name: string;
    description: string;
    paramsSchema: Record<string, ParamDef>;
    run: ToolFn;
}
export declare const AI_TOOLS: ToolDef[];
export declare const toolCatalogText: () => string;
export interface PlannedToolCall {
    name: string;
    params: Record<string, unknown>;
}
/** Validate the complete plan before the first query; identical calls run once. */
export declare function validateToolPlan(planned: PlannedToolCall[]): {
    tools: PlannedToolCall[];
    errors: {
        index: number;
        tool: string;
        message: string;
    }[];
};
/** 执行模型计划的工具调用（≤TOOL_LOOP_LIMIT；未知工具/坏参数跳过并记录） */
export declare function runPlannedTools(ctx: ToolContext, planned: PlannedToolCall[]): Promise<Evidence[]>;
export {};
//# sourceMappingURL=aiTools.d.ts.map