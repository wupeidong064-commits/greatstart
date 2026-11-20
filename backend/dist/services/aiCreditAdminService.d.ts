export interface AdminUser {
    id: string;
    role: string;
}
/** 开通机构 AI（创建或启用既有账户；校验机构归属，杜绝跨机构组合提交） */
export declare function openAccount(operator: AdminUser, organizationId: string, campusId: string | null): Promise<{
    id: string;
    alreadyOpened: boolean;
}>;
/** 按 accountId 精确启用原账户（不再按 org+campus 组合新建机构级账户，P1-04） */
export declare function enableAccountById(accountId: string): Promise<void>;
/** 停用机构 AI（保留余额，新任务拒绝） */
export declare function disableAccount(accountId: string, reason: string): Promise<void>;
/** 人工入账（充值）：套餐或自定义积分，幂等键防重复提交 */
export declare function topupAccount(params: {
    operator: AdminUser;
    accountId: string;
    packageCode?: string;
    credits?: number;
    yuanAmount?: number;
    reason: string;
    idempotencyKey: string;
}): Promise<{
    id: string;
    credits: number;
    balanceAfter: number;
    duplicate: boolean;
}>;
/** 平台管理员调整（纠错）流水类型 adjust 的入账/扣减 */
export declare function adjustAccount(params: {
    operator: AdminUser;
    accountId: string;
    credits: number;
    reason: string;
    idempotencyKey: string;
}): Promise<void>;
/**
 * 待核对账单最终处理（平台运营）：write_off=核销不扣费；charge=按核定金额扣款。
 * 并发安全（必修 1）：
 * - 先对 pending_review 做条件状态抢占（updateMany 只命中一行），抢占成功才扣款/写流水；
 *   write_off 与 charge 从同一状态抢占，天然互斥（竞争只有一个最终结果）。
 * - charge 扣款为数据库原子更新且校验 balance-reserved >= 核定额（不侵占在途预留，必修 2）；
 *   不足时整体回滚，账单留在 pending_review（核销机会保留，不改写为完成）。
 * - 流水 idempotencyKey 与账单一一对应（review-charge-{billId}），重复请求撞唯一键回滚，双保险。
 * - 重复请求（抢占失败）返回既有终态，不再扣款。
 */
export declare function reviewBill(params: {
    operator: AdminUser;
    billId: string;
    action: 'write_off' | 'charge';
    actualMicros?: number;
}): Promise<{
    status: string;
    settledMicros: number;
    duplicate?: boolean;
}>;
/** 账户列表（平台端）：附机构/机构名与消费汇总 */
export declare function listAdminAccounts(): Promise<{
    id: string;
    organizationId: string;
    organizationName: string;
    campusName: string;
    status: string;
    balanceMicros: number;
    reservedMicros: number;
    openedAt: Date | null;
}[]>;
/** 账户流水（平台端按账户查；机构端查自己账户复用同函数） */
export declare function listLedger(accountId: string, limit?: number): Promise<{
    id: string;
    createdAt: Date;
    source: string;
    type: string;
    operatorId: string | null;
    reason: string | null;
    micros: number;
    balanceAfter: number;
    billId: string | null;
    accountId: string;
    idempotencyKey: string | null;
}[]>;
/** 待核对账单（运营复核用） */
export declare function listPendingBills(accountId?: string): Promise<{
    id: string;
    organizationId: string;
    campusId: string | null;
    createdAt: Date;
    userId: string;
    status: string;
    reservedMicros: number;
    taskType: string;
    settledMicros: number;
    releasedMicros: number;
    estimateMicros: number | null;
    settledAt: Date | null;
    accountId: string;
    stopReason: string | null;
    usageJson: import("@prisma/client/runtime/library").JsonValue | null;
    conversationId: string | null;
}[]>;
//# sourceMappingURL=aiCreditAdminService.d.ts.map