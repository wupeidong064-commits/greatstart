export interface ChatUser {
    id: string;
    role: string;
    organizationId?: string | null;
    campusId?: string | null;
    name?: string | null;
}
export interface PriceSnapshot {
    model: string;
    priceVersionId: string;
    inputMicrosPer1k: number;
    outputMicrosPer1k: number;
}
export interface ChatUsage {
    promptTokens: number;
    completionTokens: number;
}
/** 按价格快照与 usage 计算消耗（微积分；最小粒度=1 微积分=0.0001 积分，半向上）。
 *  例：100入+100出 @4000/16000 → 2000μc = 0.2 积分（不再向上进位到整积分）。 */
export declare function computeCostMicros(promptTokens: number, completionTokens: number, inputMicrosPer1k: number, outputMicrosPer1k: number): number;
/** 微积分 → 展示字符串（如 "1.5"、"2000"） */
export declare function fmtMicros(micros: number): string;
/** 取某模型当前生效价格；未配置 → 拒绝（不静默套示例价，P1-06） */
export declare function getActivePrice(model: string): Promise<PriceSnapshot>;
/** 显式初始化/补齐价格目录（部署与测试脚本调用；幂等 upsert；不自动触发） */
export declare function seedPriceCatalog(): Promise<void>;
/** 增发新价格版本（调价用）；历史账单仍用各自快照 */
export declare function publishPriceVersion(model: string, inputMicrosPer1k: number, outputMicrosPer1k: number, note?: string): Promise<PriceSnapshot>;
/** 释放超时未结算的预留账单（服务重启/任务超时遗留）→ 转待核对，不永久冻结 */
export declare function sweepStaleReserves(scope?: {
    organizationId: string;
    campusId: string;
}): Promise<number>;
export interface PrepareChatResult {
    billId: string;
    accountId: string;
    maxTokens: number;
    reservedMicros: number;
}
/**
 * 对话下单：角色规则（管理员专属）→ 校区归属 → 开通/余额检查 + 预留 + 建账单（同一事务，原子）。
 * 预留判定在数据库行内完成（balance-reserved >= R），并发安全；不再有员工授权/个人限额。
 * opts.conversationId：G1 会话关联（账单可按会话对账）。
 */
export declare function prepareChatTask(user: ChatUser, totalChars: number, opts?: {
    conversationId?: string | null;
    /**
     * R1-3：全轮预留——plannedOutputTokens 覆盖本轮计划的所有模型子调用输出上限
     * （意图 + 正文 + 摘要），totalChars 需包含系统提示/历史/摘要/证据/问题的实际输入。
     * 不传则退回旧行为（仅正文一次输出），供旧调用方兼容。
     */
    plannedOutputTokens?: number;
}): Promise<PrepareChatResult>;
export interface SettleOutcome {
    calls?: Array<{
        purpose: string;
        status: string;
        usage: {
            promptTokens: number;
            completionTokens: number;
        } | null;
        [key: string]: unknown;
    }>;
    usage?: ChatUsage | null;
    /** 客户端主动停止（有/无 usage 分流） */
    clientAborted?: boolean;
    /** 上游失败（未交付可用结果） */
    upstreamError?: string | null;
    /**
     * R1-4：usage 完整性标志。任一已启动的模型子调用（意图/正文/摘要）缺 usage 时为 true——
     * 即使部分子调用有 usage，整轮也不得伪装完整结算，强制 pending_review（估算保留已知消费）。
     */
    usageIncomplete?: boolean;
}
/**
 * 对话结算：状态抢占、扣款、释放预留、写流水在同一事务内原子完成。
 * 分支（按本轮规则重排）：
 *   1) 有 usage + 用户停止 → stopped（按可核消耗结算）
 *   2) 有 usage + 正常结束 → settled
 *   3) 有 usage + 上游失败 → failed_released（不向用户扣费；usage 存档为内部成本估算）
 *   4) 无 usage + 用户停止 → pending_review（用量缺失，不伪造实际消费）
 *   5) 无 usage + 正常结束 → pending_review（用量缺失）
 *   6) 无 usage + 上游失败 → failed_released
 * 扣款/释放用原子 decrement + RETURNING，balanceAfter 为数据库真实值（并发不丢账）。
 */
export declare function settleChatTask(billId: string, outcome: SettleOutcome): Promise<{
    settledMicros: number;
    releasedMicros: number;
    balanceMicros: number;
}>;
/** 查询某用户在某账户的累计已结算消费（微积分） */
export declare function getUserUsedMicros(accountId: string, userId: string): Promise<number>;
//# sourceMappingURL=aiCreditService.d.ts.map