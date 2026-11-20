/**
 * 校区 AI 积分 · 计量核心（预留→结算→释放→扫尾）
 *
 * 记账：1 积分 = 10000 微积分（整数微积分），全程整数运算。
 * - 余额只在结算时减、入账时加；预留是占用不是扣款。
 * - 预留交易式（条件更新防透支）；结算幂等（reserved→settled 状态机）。
 * - 价格版本在下单时快照进账单，调价不改历史账单。
 * - 重启/超时遗留的 reserved 账单释放并转待核对，不永久冻结积分。
 */
import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { activeAiModel, activeAiProviderLabel } from './aiService';
import {
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_MIN_OUTPUT_TOKENS,
  CREDIT_MICROS,
  RESERVE_STALE_MS,
  priceSeedForModel,
} from '../config/aiCredits';

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
export function computeCostMicros(
  promptTokens: number,
  completionTokens: number,
  inputMicrosPer1k: number,
  outputMicrosPer1k: number
): number {
  if (
    ![promptTokens, completionTokens, inputMicrosPer1k, outputMicrosPer1k].every(
      (v) => Number.isSafeInteger(v) && v >= 0
    )
  )
    throw new ApiError('模型用量或价格无效', 400, 'INVALID_AI_USAGE');
  const raw =
    (promptTokens / 1000) * inputMicrosPer1k + (completionTokens / 1000) * outputMicrosPer1k;
  // 先消浮点尾差（保留 3 位小数）再半向上到 1 微积分
  return Math.ceil(Math.round(raw * 1000) / 1000);
}

/** 微积分 → 展示字符串（如 "1.5"、"2000"） */
export function fmtMicros(micros: number): string {
  const sign = micros < 0 ? '-' : '';
  const abs = Math.abs(micros);
  const int = Math.floor(abs / CREDIT_MICROS);
  const frac = abs % CREDIT_MICROS;
  if (frac === 0) return sign + String(int);
  const fracStr = String(frac).padStart(4, '0').replace(/0+$/, '');
  return sign + int + '.' + fracStr;
}

/* ==================== 价格版本 ==================== */

/** 取某模型当前生效价格；未配置 → 拒绝（不静默套示例价，P1-06） */
export async function getActivePrice(model: string): Promise<PriceSnapshot> {
  // Mock usage is synthetic and must never consume a customer's paid balance.
  if (model === 'mock-recorded-v1')
    return {
      model,
      priceVersionId: 'mock-zero-cost-v1',
      inputMicrosPer1k: 0,
      outputMicrosPer1k: 0,
    };
  const row = await prisma.aiModelPrice.findFirst({
    where: { model, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!row) {
    throw new ApiError(
      `模型 ${model} 未配置价格，已拒绝调用（请联系平台配置价格版本）`,
      503,
      'AI_PRICE_MISSING'
    );
  }
  if (
    ![row.inputMicrosPer1k, row.outputMicrosPer1k].every(
      (v) => Number.isSafeInteger(v) && v >= 0
    ) ||
    /示例|估算|测试|验收|合成价|默认档|恢复\s*v1|example|estimate|test|synthetic/i.test(
      row.note || ''
    )
  )
    throw new ApiError(
      `模型 ${model} 的价格为测试/估算或无效价，已拒绝真实消费`,
      503,
      'AI_PRICE_UNVERIFIED'
    );
  return {
    model: row.model,
    priceVersionId: row.id,
    inputMicrosPer1k: row.inputMicrosPer1k,
    outputMicrosPer1k: row.outputMicrosPer1k,
  };
}

/** 显式初始化/补齐价格目录（部署与测试脚本调用；幂等 upsert；不自动触发） */
export async function seedPriceCatalog(): Promise<void> {
  const model = activeAiModel();
  const existing = await prisma.aiModelPrice.findFirst({
    where: { model, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (existing) return;
  const seed = priceSeedForModel(model);
  await prisma.aiModelPrice.create({
    data: { model, ...seed, note: `${seed.note}（初始化脚本落库）` },
  });
}

/** 增发新价格版本（调价用）；历史账单仍用各自快照 */
export async function publishPriceVersion(
  model: string,
  inputMicrosPer1k: number,
  outputMicrosPer1k: number,
  note?: string
): Promise<PriceSnapshot> {
  if (
    !model.trim() ||
    ![inputMicrosPer1k, outputMicrosPer1k].every((v) => Number.isSafeInteger(v) && v >= 0)
  )
    throw new ApiError('模型和价格必须有效且价格为非负整数', 400, 'INVALID_AI_PRICE');
  const row = await prisma.aiModelPrice.create({
    data: { model, inputMicrosPer1k, outputMicrosPer1k, note: note ?? '人工调价' },
  });
  return {
    model: row.model,
    priceVersionId: row.id,
    inputMicrosPer1k: row.inputMicrosPer1k,
    outputMicrosPer1k: row.outputMicrosPer1k,
  };
}

/* ==================== 扫尾 ==================== */

/** 释放超时未结算的预留账单（服务重启/任务超时遗留）→ 转待核对，不永久冻结 */
export async function sweepStaleReserves(scope?: {
  organizationId: string;
  campusId: string;
}): Promise<number> {
  const stale = await prisma.aiTaskBill.findMany({
    where: {
      ...(scope || {}),
      status: 'reserved',
      createdAt: { lt: new Date(Date.now() - RESERVE_STALE_MS) },
    },
    take: 50,
  });
  for (const bill of stale) {
    await prisma.$transaction(async (tx) => {
      const done = await tx.aiTaskBill.updateMany({
        where: { id: bill.id, status: 'reserved' },
        data: {
          status: 'pending_review',
          releasedMicros: bill.reservedMicros,
          stopReason: '任务超时或服务重启，预留已释放待核对',
        },
      });
      if (done.count === 0) return;
      await tx.aiCreditAccount.update({
        where: { id: bill.accountId },
        data: { reservedMicros: { decrement: bill.reservedMicros } },
      });
    });
  }
  return stale.length;
}

/* ==================== 对话计量 ==================== */

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
export async function prepareChatTask(
  user: ChatUser,
  totalChars: number,
  opts?: {
    conversationId?: string | null;
    /**
     * R1-3：全轮预留——plannedOutputTokens 覆盖本轮计划的所有模型子调用输出上限
     * （意图 + 正文 + 摘要），totalChars 需包含系统提示/历史/摘要/证据/问题的实际输入。
     * 不传则退回旧行为（仅正文一次输出），供旧调用方兼容。
     */
    plannedOutputTokens?: number;
  }
): Promise<PrepareChatResult> {
  if (
    !Number.isSafeInteger(totalChars) ||
    totalChars < 0 ||
    (opts?.plannedOutputTokens !== undefined &&
      (!Number.isSafeInteger(opts.plannedOutputTokens) || opts.plannedOutputTokens < 0))
  )
    throw new ApiError('模型预留预算无效', 400, 'INVALID_AI_BUDGET');

  const organizationId = user.organizationId || '';
  if (!organizationId) throw new ApiError('未分配机构', 403, 'FORBIDDEN');

  // 角色规则（产品定稿）：仅机构/校区管理员可消费 AI；销售/教练/员工/家长不开放。
  // 旧员工授权记录一律不参与判断（功能已取消，历史账务保留）。
  const normalizedRole = user.role === 'teacher' ? 'coach' : user.role;
  if (!['manager', 'admin'].includes(normalizedRole)) {
    throw new ApiError('AI 服务仅对机构/校区管理员开放（首版）', 403, 'AI_NOT_FOR_ROLE');
  }

  // 校区归属：无明确校区拒绝消费，不静默退回机构级钱包（P1-02）
  if (!user.campusId) {
    throw new ApiError(
      '当前账号未绑定校区，请先选择/绑定校区后再使用 AI',
      403,
      'AI_CAMPUS_REQUIRED'
    );
  }

  const campus = await prisma.campus.findFirst({ where: { id: user.campusId, organizationId } });
  if (!campus) throw new ApiError('校区不属于当前机构', 403, 'FORBIDDEN');
  if (
    opts?.conversationId &&
    !(await prisma.aiConversation.findFirst({
      where: {
        id: opts.conversationId,
        ownerUserId: user.id,
        organizationId,
        campusId: user.campusId,
        status: 'active',
      },
    }))
  )
    throw new ApiError('会话不属于当前用户或校区', 403, 'FORBIDDEN');
  await sweepStaleReserves({ organizationId, campusId: user.campusId });

  // 账户：必须精确匹配校区
  const account = await prisma.aiCreditAccount.findFirst({
    where: { organizationId, campusId: user.campusId },
  });
  if (!account || account.status !== 'active') {
    throw new ApiError('本校区尚未开通 AI 服务，请联系平台开通或购买积分', 403, 'AI_NOT_ENABLED');
  }

  // 价格快照（下单时锁定）；未配置价格 → 拒绝（不静默套示例价）
  const model = activeAiModel();
  const price = await getActivePrice(model);

  // 可用额度约束输出长度；预留按最坏情况（全按输出价）估算
  const capMicros = account.balanceMicros - account.reservedMicros;
  const freeModel = price.inputMicrosPer1k === 0 && price.outputMicrosPer1k === 0;
  if (capMicros <= 0 && !freeModel) {
    throw new ApiError('校区 AI 积分余额不足，请充值后重试', 402, 'AI_NO_BALANCE');
  }
  const maxAffordableTokens = freeModel
    ? CHAT_MAX_OUTPUT_TOKENS
    : Math.floor((capMicros / Math.max(price.inputMicrosPer1k, price.outputMicrosPer1k)) * 1000) -
      totalChars;
  const maxTokens = Math.min(CHAT_MAX_OUTPUT_TOKENS, maxAffordableTokens);
  if (maxTokens < CHAT_MIN_OUTPUT_TOKENS) {
    throw new ApiError('校区 AI 积分余额不足本次对话，请充值后重试', 402, 'AI_NO_BALANCE');
  }
  // R1-3：预留覆盖全轮输出（意图+正文+摘要）；无计划值时退回仅正文
  const plannedOutput = opts?.plannedOutputTokens ?? maxTokens;
  // 预留粒度 = 1 微积分；输入按输出价保守估算（沿用既有最坏情况口径）
  const reservedMicros = Math.ceil(
    ((totalChars + plannedOutput) / 1000) *
      Math.max(price.inputMicrosPer1k, price.outputMicrosPer1k)
  );

  // 预留 + 建账单：同一事务；预留判定在数据库行内（原子），并发不超卖
  const created = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ balanceMicros: number; reservedMicros: number }>>(
      `UPDATE "ai_credit_accounts"
         SET "reservedMicros" = "reservedMicros" + $1
       WHERE "id" = $2 AND "status" = 'active'
         AND "balanceMicros" - "reservedMicros" >= $1
       RETURNING "balanceMicros", "reservedMicros"`,
      reservedMicros,
      account.id
    );
    if (rows.length === 0) {
      throw new ApiError('校区 AI 积分余额不足（并发占用），请稍后重试', 402, 'AI_NO_BALANCE');
    }
    const bill = await tx.aiTaskBill.create({
      data: {
        accountId: account.id,
        organizationId,
        campusId: user.campusId ?? null,
        userId: user.id,
        taskType: 'chat',
        status: 'reserved',
        reservedMicros,
        conversationId: opts?.conversationId ?? null,
        usageJson: {
          model,
          provider: activeAiProviderLabel(),
          synthetic: model === 'mock-recorded-v1',
          priceVersionId: price.priceVersionId,
          inputMicrosPer1k: price.inputMicrosPer1k,
          outputMicrosPer1k: price.outputMicrosPer1k,
          estInputTokens: totalChars,
          maxTokens,
          ...(opts?.plannedOutputTokens ? { plannedOutputTokens: opts.plannedOutputTokens } : {}),
        },
      },
    });
    return bill;
  });

  return { billId: created.id, accountId: account.id, maxTokens, reservedMicros };
}

export interface SettleOutcome {
  calls?: Array<{
    purpose: string;
    status: string;
    usage: { promptTokens: number; completionTokens: number } | null;
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
export async function settleChatTask(
  billId: string,
  outcome: SettleOutcome
): Promise<{ settledMicros: number; releasedMicros: number; balanceMicros: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${billId}))`;
    const bill = await tx.aiTaskBill.findUnique({ where: { id: billId } });
    if (!bill) throw new ApiError('任务账单不存在', 404, 'BILL_NOT_FOUND');
    if (bill.status !== 'reserved') {
      // 重复结算请求：返回既有结果，不重复扣款
      return {
        settledMicros: bill.settledMicros,
        releasedMicros: bill.releasedMicros,
        balanceMicros: (
          await tx.aiCreditAccount.findUniqueOrThrow({ where: { id: bill.accountId } })
        ).balanceMicros,
      };
    }
    const meta = (bill.usageJson ?? {}) as Record<string, any>;
    const inRate = Number(meta.inputMicrosPer1k ?? 0);
    const outRate = Number(meta.outputMicrosPer1k ?? 0);
    const usage = outcome.usage;
    const validRates = [inRate, outRate].every((v) => Number.isSafeInteger(v) && v >= 0);
    const hasUsage = !!(
      validRates &&
      usage &&
      [usage.promptTokens, usage.completionTokens].every((v) => Number.isSafeInteger(v) && v >= 0)
    );
    // R1-4：子调用用量不完整 → 不允许 settled/stopped 的“完整结算”语义
    const callTotals = outcome.calls
      ?.filter((c) => c.usage)
      .reduce(
        (a, c) => ({
          promptTokens: a.promptTokens + c.usage!.promptTokens,
          completionTokens: a.completionTokens + c.usage!.completionTokens,
        }),
        { promptTokens: 0, completionTokens: 0 }
      );
    const mismatched = Boolean(
      outcome.calls &&
      outcome.calls.length &&
      hasUsage &&
      callTotals &&
      (callTotals.promptTokens !== usage!.promptTokens ||
        callTotals.completionTokens !== usage!.completionTokens)
    );
    const incomplete =
      outcome.usageIncomplete === true ||
      mismatched ||
      Boolean(outcome.calls?.some((c) => c.status !== 'skipped' && !c.usage));

    let settled = 0;
    let status: string;
    let stopReason: string | null = null;
    let estimate: number | null = null;

    if (meta.model === 'mock-recorded-v1' || meta.synthetic === true) {
      status = outcome.upstreamError
        ? 'failed_released'
        : incomplete
          ? 'pending_review'
          : outcome.clientAborted
            ? 'stopped'
            : 'settled';
      stopReason = incomplete
        ? 'mock 子调用用量缺失，零扣费但保留待核对状态'
        : 'mock 合成用量，零成本验收，不扣客户积分';
    } else if (outcome.calls?.length === 0) {
      status = 'settled';
      stopReason = '本地范围校验或澄清，无模型调用，零消耗';
    } else if (outcome.upstreamError) {
      status = 'failed_released';
      estimate = hasUsage
        ? computeCostMicros(usage!.promptTokens, usage!.completionTokens, inRate, outRate)
        : null;
      stopReason = '上游失败未交付，不扣客户积分';
    } else if (incomplete && hasUsage && !outcome.upstreamError) {
      // R1-4：部分子调用缺 usage（如意图有用量、正文停止未回）——已知部分照算为估算，
      // 整轮强制 pending_review，不伪装完整结算；不向用户按不完整数字扣款
      status = 'pending_review';
      estimate = computeCostMicros(usage!.promptTokens, usage!.completionTokens, inRate, outRate);
      stopReason = `模型子调用量不完整（已知部分估算 ${(estimate / CREDIT_MICROS).toFixed(4)} 积分），待核对`;
    } else if (hasUsage && outcome.clientAborted) {
      settled = computeCostMicros(usage!.promptTokens, usage!.completionTokens, inRate, outRate);
      status = 'stopped';
      stopReason = '用户停止生成，按可核实消耗结算';
    } else if (hasUsage && !outcome.upstreamError) {
      settled = computeCostMicros(usage!.promptTokens, usage!.completionTokens, inRate, outRate);
      status = 'settled';
    } else if (hasUsage && outcome.upstreamError) {
      // 有消耗但系统失败未交付可用结果：不向用户扣费（usage 留档为内部成本估算）
      status = 'failed_released';
      estimate = computeCostMicros(usage!.promptTokens, usage!.completionTokens, inRate, outRate);
      stopReason = `上游失败未交付，不扣费（内部成本估算 ${(estimate / CREDIT_MICROS).toFixed(4)} 积分）`;
    } else if (outcome.clientAborted) {
      status = 'pending_review';
      stopReason = '用户停止且上游用量缺失，待核对';
      estimate = bill.reservedMicros;
    } else if (outcome.upstreamError) {
      status = 'failed_released';
      stopReason = `上游失败：${String(outcome.upstreamError).slice(0, 120)}`;
    } else {
      status = 'pending_review';
      stopReason = '任务结束但上游用量缺失，待核对';
      estimate = bill.reservedMicros;
    }

    if (settled > bill.reservedMicros) {
      estimate = settled;
      settled = 0;
      status = 'pending_review';
      stopReason = '上游用量超出已预留预算，未自动超额扣费，待核对';
    }
    const released =
      status === 'settled' || status === 'stopped'
        ? bill.reservedMicros - settled
        : bill.reservedMicros;

    const newUsage = {
      ...meta,
      calls: outcome.calls || [
        { purpose: 'legacy_combined', status: hasUsage ? 'ok' : 'unknown', usage: usage || null },
      ],
      knownUsage:
        outcome.calls?.length === 0 ? { promptTokens: 0, completionTokens: 0 } : usage || null,
      usageComplete: outcome.calls?.length === 0 || (!incomplete && hasUsage),
      usageSource: meta.synthetic ? 'synthetic' : hasUsage ? 'provider_reported' : 'missing',
    };

    const claimed = await tx.aiTaskBill.updateMany({
      where: { id: bill.id, status: 'reserved' },
      data: {
        status,
        settledMicros: settled,
        releasedMicros: released,
        stopReason,
        estimateMicros: estimate,
        usageJson: newUsage as any,
        settledAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return {
        settledMicros: bill.settledMicros,
        releasedMicros: bill.releasedMicros,
        balanceMicros: (
          await tx.aiCreditAccount.findUniqueOrThrow({ where: { id: bill.accountId } })
        ).balanceMicros,
      };
    }

    // 账户原子变更：decrement + RETURNING 真实余额（并发不丢账；条件保证不为负）
    const updatedRows = await tx.$queryRawUnsafe<Array<{ balanceMicros: number }>>(
      `UPDATE "ai_credit_accounts"
         SET "balanceMicros" = "balanceMicros" - $1,
             "reservedMicros" = "reservedMicros" - $2
       WHERE "id" = $3
         AND "balanceMicros" >= $1
         AND "reservedMicros" >= $2
       RETURNING "balanceMicros"`,
      settled,
      bill.reservedMicros,
      bill.accountId
    );
    if (updatedRows.length === 0) {
      // 理论不可达（预留机制保证），出现即为账务异常：抛错回滚，人工介入
      throw new ApiError('账务状态异常：结算时余额/预留不足，已回滚', 500, 'LEDGER_INCONSISTENT');
    }
    const newBalance = updatedRows[0].balanceMicros;

    if (settled > 0) {
      await tx.aiCreditLedger.create({
        data: {
          accountId: bill.accountId,
          type: 'settle',
          source: 'chat',
          micros: -settled,
          balanceAfter: newBalance,
          billId: bill.id,
          operatorId: bill.userId,
          reason: `AI 对话消费（task ${bill.id.slice(0, 8)}）`,
        },
      });
    }

    return { settledMicros: settled, releasedMicros: released, balanceMicros: newBalance };
  });
}

/** 查询某用户在某账户的累计已结算消费（微积分） */
export async function getUserUsedMicros(accountId: string, userId: string): Promise<number> {
  const agg = await prisma.aiTaskBill.aggregate({
    _sum: { settledMicros: true },
    where: { accountId, userId, status: { in: ['settled', 'stopped'] } },
  });
  return agg._sum.settledMicros ?? 0;
}
