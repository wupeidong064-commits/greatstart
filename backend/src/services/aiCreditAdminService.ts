/**
 * 机构 AI 积分 · 运营操作（平台开通/停用/人工入账/赠送/流水查询）
 *
 * - 入账幂等：idempotencyKey 唯一约束，重复提交返回既有记录不重复加积分
 * - 资金/积分调整全部留 操作人+原因+时间（流水）
 * - 机构管理员不能自行加余额（本模块所有写操作 requireMinRole('admin')）
 */
import prisma from '../config/database';
import { resolveDefaultCampus } from './organizationScope';
import { ApiError } from '../middleware/errorHandler';
import { AI_PACKAGES, CREDIT_MICROS, creditsToMicros, fmtMicros } from '../config/aiCredits';

export interface AdminUser {
  id: string;
  role: string;
}

/** 开通机构 AI（创建或启用既有账户；校验机构归属，杜绝跨机构组合提交） */
export async function openAccount(
  operator: AdminUser,
  organizationId: string,
  campusId: string | null
): Promise<{ id: string; alreadyOpened: boolean }> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    const campus = await resolveDefaultCampus(tx, organizationId);
    if (campusId && campusId !== campus.id) {
      throw new ApiError('账户范围与机构不符', 400, 'CAMPUS_MISMATCH');
    }
    const existing = await tx.aiCreditAccount.findUnique({
      where: { organizationId_campusId: { organizationId, campusId: campus.id } },
    });
    if (existing) {
      if (existing.status === 'disabled') {
        await tx.aiCreditAccount.update({ where: { id: existing.id }, data: { status: 'active' } });
      }
      return { id: existing.id, alreadyOpened: true };
    }
    const created = await tx.aiCreditAccount.create({
      data: { organizationId, campusId: campus.id, status: 'active', openedById: operator.id, openedAt: new Date() },
    });
    return { id: created.id, alreadyOpened: false };
  });
}

/** 按 accountId 精确启用原账户（不再按 org+campus 组合新建机构级账户，P1-04） */
export async function enableAccountById(accountId: string): Promise<void> {
  await prisma.aiCreditAccount.update({
    where: { id: accountId },
    data: { status: 'active' },
  });
}

/** 停用机构 AI（保留余额，新任务拒绝） */
export async function disableAccount(accountId: string, reason: string): Promise<void> {
  await prisma.aiCreditAccount.update({
    where: { id: accountId },
    data: { status: 'disabled' },
  });
  void reason;
}

/** 人工入账（充值）：套餐或自定义积分，幂等键防重复提交 */
export async function topupAccount(params: {
  operator: AdminUser;
  accountId: string;
  packageCode?: string;
  credits?: number;
  yuanAmount?: number;
  reason: string;
  idempotencyKey: string;
}): Promise<{ id: string; credits: number; balanceAfter: number; duplicate: boolean }> {
  const { operator, accountId, packageCode, reason, idempotencyKey } = params;

  let micros: number;
  let source: string;
  let yuan: number | null = null;
  if (packageCode) {
    const pkg = AI_PACKAGES[packageCode];
    if (!pkg) throw new ApiError('未知套餐', 400, 'UNKNOWN_PACKAGE');
    micros = creditsToMicros(pkg.credits);
    source = 'package';
    yuan = pkg.priceYuan;
  } else if (params.credits != null) {
    if (!Number.isFinite(params.credits) || params.credits <= 0) throw new ApiError('积分必须为正数', 400, 'INVALID_CREDITS');
    micros = creditsToMicros(params.credits);
    source = 'manual';
    yuan = params.yuanAmount ?? null;
  } else {
    throw new ApiError('请提供套餐或自定义积分', 400, 'MISSING_CREDITS');
  }

  if (!idempotencyKey?.trim() || !Number.isSafeInteger(micros) || micros<=0 || micros>2147483647) throw new ApiError('积分或幂等键无效',400,'INVALID_CREDITS');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;
    const existing = await tx.aiCreditLedger.findUnique({where:{idempotencyKey}});
    if (existing) {
      if (existing.accountId!==accountId || existing.micros!==micros || existing.source!==source) throw new ApiError('幂等键已用于不同账户或金额',409,'IDEMPOTENCY_CONFLICT');
      return {id:existing.id,credits:existing.micros,balanceAfter:existing.balanceAfter,duplicate:true};
    }
    const acc = await tx.aiCreditAccount.findUnique({ where: { id: accountId } });
    if (!acc) throw new ApiError('账户不存在', 404, 'ACCOUNT_NOT_FOUND');
    // 原子递增并取真实余额（并发入账时 balanceAfter 不错账）
    const rows = await tx.$queryRawUnsafe<Array<{ balanceMicros: number }>>(
      `UPDATE "ai_credit_accounts" SET "balanceMicros" = "balanceMicros" + $1 WHERE "id" = $2 RETURNING "balanceMicros"`,
      micros,
      accountId
    );
    if (rows.length === 0) throw new ApiError('账户不存在', 404, 'ACCOUNT_NOT_FOUND');
    const newBalance = rows[0].balanceMicros;
    const ledger = await tx.aiCreditLedger.create({
      data: {
        accountId,
        type: packageCode ? 'topup' : 'grant',
        source,
        micros,
        balanceAfter: newBalance,
        operatorId: operator.id,
        reason: packageCode
          ? `[${reason}] 套餐「${AI_PACKAGES[packageCode].name}」¥${yuan} → ${fmtMicros(micros)} 积分`
          : `[${reason}] ${yuan != null ? `¥${yuan} → ` : ''}${fmtMicros(micros)} 积分`,
        idempotencyKey,
      },
    });
    return { id: ledger.id, credits: micros, balanceAfter: newBalance, duplicate: false };
  });
}

/** 平台管理员调整（纠错）流水类型 adjust 的入账/扣减 */
export async function adjustAccount(params: {
  operator: AdminUser;
  accountId: string;
  credits: number; // 正负皆可
  reason: string;
  idempotencyKey: string;
}): Promise<void> {
  const { operator, accountId, credits, reason, idempotencyKey } = params;
  const micros = creditsToMicros(credits);
  if (!Number.isFinite(credits) || !Number.isSafeInteger(micros) || micros === 0 || Math.abs(micros)>2147483647 || !idempotencyKey?.trim()) throw new ApiError('调整量不能为 0', 400, 'INVALID_CREDITS');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;
    const existing = await tx.aiCreditLedger.findUnique({where:{idempotencyKey}});
    if (existing) {
      if (existing.accountId!==accountId || existing.micros!==micros || existing.type!=='adjust') throw new ApiError('幂等键已用于不同账户或金额',409,'IDEMPOTENCY_CONFLICT');
      return;
    }
    const acc = await tx.aiCreditAccount.findUnique({ where: { id: accountId } });
    if (!acc) throw new ApiError('账户不存在', 404, 'ACCOUNT_NOT_FOUND');
    // 原子更新：扣减（micros<0）必须满足 balance-reserved >= 扣款（不侵占在途预留），
    // 条件在数据库行内判定，并发负调整不透支（必修 2）
    const rows =
      micros < 0
        ? await tx.$queryRawUnsafe<Array<{ balanceMicros: number }>>(
            `UPDATE "ai_credit_accounts" SET "balanceMicros" = "balanceMicros" + $1
             WHERE "id" = $2 AND "balanceMicros" + $1 - "reservedMicros" >= 0
             RETURNING "balanceMicros"`,
            micros,
            accountId
          )
        : await tx.$queryRawUnsafe<Array<{ balanceMicros: number }>>(
            `UPDATE "ai_credit_accounts" SET "balanceMicros" = "balanceMicros" + $1
             WHERE "id" = $2 RETURNING "balanceMicros"`,
            micros,
            accountId
          );
    if (rows.length === 0) {
      throw new ApiError(
        `调整后可用额度不足（需保证余额−预留 ≥ 0），已拒绝：当前余额 ${acc.balanceMicros}，预留 ${acc.reservedMicros}`,
        400,
        'INSUFFICIENT_AVAILABLE'
      );
    }
    await tx.aiCreditLedger.create({
      data: {
        accountId,
        type: 'adjust',
        source: 'review',
        micros,
        balanceAfter: rows[0].balanceMicros,
        operatorId: operator.id,
        reason,
        idempotencyKey,
      },
    });
  });
}

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
export async function reviewBill(params: {
  operator: AdminUser;
  billId: string;
  action: 'write_off' | 'charge';
  actualMicros?: number;
}): Promise<{ status: string; settledMicros: number; duplicate?: boolean }> {
  const { operator, billId, action, actualMicros } = params;
  if (!['write_off','charge'].includes(action) || (action==='charge' && (!Number.isSafeInteger(actualMicros) || actualMicros! <= 0))) throw new ApiError('核定金额无效',400,'INVALID_CREDITS');
  const targetStatus = action === 'write_off' ? 'reviewed_written_off' : 'settled';

  return prisma.$transaction(async (tx) => {
    const bill = await tx.aiTaskBill.findUnique({ where: { id: billId } });
    if (!bill) throw new ApiError('账单不存在', 404, 'BILL_NOT_FOUND');

    const meta=(bill.usageJson||{}) as Record<string,any>;
    if (action==='charge' && (meta.model==='mock-recorded-v1'||meta.synthetic===true)) throw new ApiError('模拟用量禁止向客户扣费',409,'SYNTHETIC_USAGE');
    // 1) 条件状态抢占：仅 pending_review 可被处理一次（write_off / charge 同源互斥）
    const claimNote =
      action === 'write_off' ? '→ 平台核销（不扣费）' : '→ 平台核定扣款';
    const claimed = await tx.aiTaskBill.updateMany({
      where: { id: billId, status: 'pending_review' },
      data: {
        status: targetStatus,
        settledMicros: action === 'charge' ? Math.max(0, Math.round(actualMicros ?? 0)) : 0,
        settledAt: new Date(),
        stopReason: `${bill.stopReason ?? ''} ${claimNote}`.slice(0, 200),
      },
    });
    if (claimed.count === 0) {
      // 重复请求：返回既有终态，不再扣款
      const current = await tx.aiTaskBill.findUnique({ where: { id: billId } });
      return {
        status: current?.status ?? bill.status,
        settledMicros: current?.settledMicros ?? 0,
        duplicate: true,
      };
    }

    if (action === 'write_off') {
      // 核销不涉及资金；账单已进入终态
      return { status: 'reviewed_written_off', settledMicros: 0 };
    }

    // 2) charge：核定扣款（原子 + 预留感知：balance-reserved >= 核定额）
    const settled = Math.max(0, Math.round(actualMicros ?? 0));
    if (settled <= 0) {
      throw new ApiError('核定扣款金额必须大于 0', 400, 'INVALID_CREDITS');
    }
    if (settled > bill.reservedMicros) {
      throw new ApiError('核定金额不能超过该账单预留额度', 400, 'EXCEED_RESERVE');
    }
    const rows = await tx.$queryRawUnsafe<Array<{ balanceMicros: number }>>(
      `UPDATE "ai_credit_accounts" SET "balanceMicros" = "balanceMicros" - $1
       WHERE "id" = $2 AND "balanceMicros" - "reservedMicros" >= $1
       RETURNING "balanceMicros"`,
      settled,
      bill.accountId
    );
    if (rows.length === 0) {
      // 不足：整体回滚（账单回到 pending_review，核销机会保留）
      throw new ApiError(
        '可用额度不足（余额−预留 < 核定额），无法补扣；账单保持待核对',
        402,
        'INSUFFICIENT_AVAILABLE'
      );
    }
    const balanceAfter = rows[0].balanceMicros;

    // 3) 流水（幂等键与账单绑定：重复 review 撞唯一键整体回滚，双保险）
    await tx.aiCreditLedger.create({
      data: {
        accountId: bill.accountId,
        type: 'settle',
        source: 'review',
        micros: -settled,
        balanceAfter,
        billId,
        operatorId: operator.id,
        reason: `待核对复核核定扣款（task ${billId.slice(0, 8)}）`,
        idempotencyKey: `review-charge-${billId}`,
      },
    });
    return { status: 'settled', settledMicros: settled };
  });
}

/** 账户列表（平台端）：附机构/机构名与消费汇总 */
export async function listAdminAccounts() {
  const accounts = await prisma.aiCreditAccount.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const orgIds = Array.from(new Set(accounts.map((a) => a.organizationId)));
  const campusIds = accounts.map((a) => a.campusId).filter(Boolean) as string[];
  const [orgs, campuses] = await Promise.all([
    prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }),
    campusIds.length
      ? prisma.campus.findMany({ where: { id: { in: campusIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
  const campusMap = new Map(campuses.map((c) => [c.id, c.name]));
  return accounts.map((a) => ({
    id: a.id,
    organizationId: a.organizationId,
    organizationName: orgMap.get(a.organizationId) ?? a.organizationId,
    campusName: a.campusId ? campusMap.get(a.campusId) ?? a.campusId : '（机构级）',
    status: a.status,
    balanceMicros: a.balanceMicros,
    reservedMicros: a.reservedMicros,
    openedAt: a.openedAt,
  }));
}

/** 账户流水（平台端按账户查；机构端查自己账户复用同函数） */
export async function listLedger(accountId: string, limit = 50) {
  return prisma.aiCreditLedger.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}

/** 待核对账单（运营复核用） */
export async function listPendingBills(accountId?: string) {
  return prisma.aiTaskBill.findMany({
    where: { status: 'pending_review', ...(accountId ? { accountId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
