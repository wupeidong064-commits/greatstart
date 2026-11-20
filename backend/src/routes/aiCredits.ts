/**
 * 机构 AI 积分 · 路由
 *
 * 权限分层：
 * - /admin/*        平台运营管理员（role=admin）：开通/停用/人工入账/赠送/全量流水
 * - /account /bills /employees /authorizations  机构管理员（manager）：查看与授权
 * - /my-bills       授权员工查看自己的任务记录
 * - /packages       登录即可读（套餐介绍）
 * 所有查询范围由登录身份决定（org/campus），不信任前端提交的范围参数。
 */
import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireMinRole } from '../middleware/rbac';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import prisma from '../config/database';
import { fmtMicros } from '../config/aiCredits';
import {
  getUserUsedMicros,
} from '../services/aiCreditService';
import {
  openAccount,
  enableAccountById,
  disableAccount,
  topupAccount,
  adjustAccount,
  listAdminAccounts,
  listLedger,
  listPendingBills,
  reviewBill,
} from '../services/aiCreditAdminService';

export const aiCreditRoutes = Router();

aiCreditRoutes.use(authenticate);

/** 套餐配置（登录即可读，用于页面展示） */
aiCreditRoutes.get('/packages', async (_req, res, next) => {
  try {
    const { AI_PACKAGES, CREDITS_PER_YUAN } = await import('../config/aiCredits');
    sendSuccess(res, { packages: AI_PACKAGES, creditsPerYuan: CREDITS_PER_YUAN });
  } catch (e) { next(e); }
});


aiCreditRoutes.use(requireOrganizationAccess());

const getUser = (req: any) => req.user;

/** 解析当前用户的机构账户（无则 404 语义错误） */
async function requireOwnAccount(req: any) {
  const user = getUser(req);
  const account = await prisma.aiCreditAccount.findFirst({
    where: { organizationId: user.organizationId, campusId: user.campusId ?? null },
  });
  if (!account) {
    throw new ApiError('本机构尚未开通 AI 服务', 404, 'AI_NOT_ENABLED');
  }
  return { user, account };
}

/* ==================== 平台端（平台运营身份，独立于租户角色） ==================== */

/** 平台运营校验：要求 User.isPlatformAdmin（独立授予），租户 admin/manager 均不放行（P0-01） */
const requirePlatformAdmin = (req: any, _res: Response, next: NextFunction) => {
  const user = getUser(req);
  if (!user?.isPlatformAdmin) {
    return next(new ApiError('需要平台运营权限（独立授予）', 403, 'PLATFORM_ADMIN_REQUIRED'));
  }
  next();
};
const adminOnly = requirePlatformAdmin;

/** 开通（首次，按机构+机构组合；校验机构归属） */
aiCreditRoutes.post('/admin/open', adminOnly, async (req, res, next) => {
  try {
    const { organizationId, campusId } = req.body ?? {};
    if (!organizationId) throw new ApiError('缺少 organizationId', 400, 'VALIDATION_ERROR');
    const r = await openAccount(getUser(req), organizationId, campusId ?? null);
    sendSuccess(res, r, r.alreadyOpened ? '机构 AI 已开通' : '机构 AI 开通成功', 201);
  } catch (e) { next(e); }
});

/** 启用既有账户（按 accountId 精确启用原账户，不再新建机构级账户，P1-04） */
aiCreditRoutes.post('/admin/enable', adminOnly, async (req, res, next) => {
  try {
    const { accountId } = req.body ?? {};
    if (!accountId) throw new ApiError('缺少 accountId', 400, 'VALIDATION_ERROR');
    await enableAccountById(accountId);
    sendSuccess(res, { ok: true }, '已启用原账户');
  } catch (e) { next(e); }
});

/** 配置模型价格版本（平台运营；未配置的模型会被拒绝调用） */
aiCreditRoutes.post('/admin/prices', adminOnly, async (req, res, next) => {
  try {
    const { model, inputMicrosPer1k, outputMicrosPer1k, note } = req.body ?? {};
    if (!model || !inputMicrosPer1k || !outputMicrosPer1k) {
      throw new ApiError('缺少 model / inputMicrosPer1k / outputMicrosPer1k', 400, 'VALIDATION_ERROR');
    }
    const { publishPriceVersion } = await import('../services/aiCreditService');
    const r = await publishPriceVersion(String(model), Number(inputMicrosPer1k), Number(outputMicrosPer1k), note);
    sendSuccess(res, r, '价格版本已发布', 201);
  } catch (e) { next(e); }
});

/** 待核对账单复核（write_off 核销 / charge 核定扣款） */
aiCreditRoutes.post('/admin/review-bill', adminOnly, async (req, res, next) => {
  try {
    const { billId, action, actualMicros } = req.body ?? {};
    if (!billId || !['write_off', 'charge'].includes(action)) {
      throw new ApiError('缺少 billId 或 action 非法', 400, 'VALIDATION_ERROR');
    }
    const r = await reviewBill({ operator: getUser(req), billId, action, actualMicros: Number(actualMicros) || 0 });
    sendSuccess(res, r, action === 'write_off' ? '已核销（不扣费）' : '已按核定金额扣款');
  } catch (e) { next(e); }
});

/** 停用机构 AI */
aiCreditRoutes.post('/admin/disable', adminOnly, async (req, res, next) => {
  try {
    const { accountId, reason } = req.body ?? {};
    if (!accountId) throw new ApiError('缺少 accountId', 400, 'VALIDATION_ERROR');
    await disableAccount(accountId, reason ?? '');
    sendSuccess(res, { ok: true }, '已停用机构 AI（余额保留）');
  } catch (e) { next(e); }
});

/** 人工入账（套餐或自定义积分；幂等） */
aiCreditRoutes.post('/admin/topup', adminOnly, async (req, res, next) => {
  try {
    const { accountId, packageCode, credits, yuanAmount, reason, idempotencyKey } = req.body ?? {};
    if (!accountId || !idempotencyKey || !reason) {
      throw new ApiError('缺少 accountId / reason / idempotencyKey', 400, 'VALIDATION_ERROR');
    }
    const r = await topupAccount({
      operator: getUser(req),
      accountId,
      packageCode,
      credits,
      yuanAmount,
      reason,
      idempotencyKey: String(idempotencyKey),
    });
    sendSuccess(res, r, r.duplicate ? '重复请求已忽略（未重复入账）' : '入账成功', 201);
  } catch (e) { next(e); }
});

/** 赠送积分（adjust 类；幂等） */
aiCreditRoutes.post('/admin/adjust', adminOnly, async (req, res, next) => {
  try {
    const { accountId, credits, reason, idempotencyKey } = req.body ?? {};
    if (!accountId || !idempotencyKey || !reason || credits == null) {
      throw new ApiError('缺少必要字段', 400, 'VALIDATION_ERROR');
    }
    await adjustAccount({
      operator: getUser(req),
      accountId,
      credits: Number(credits),
      reason: `[赠送] ${reason}`,
      idempotencyKey: String(idempotencyKey),
    });
    sendSuccess(res, { ok: true }, '赠送积分已入账', 201);
  } catch (e) { next(e); }
});

/** 平台账户列表 */
aiCreditRoutes.get('/admin/accounts', adminOnly, async (_req, res, next) => {
  try { sendSuccess(res, await listAdminAccounts()); } catch (e) { next(e); }
});

/** 平台查流水（按账户） */
aiCreditRoutes.get('/admin/ledger', adminOnly, async (req, res, next) => {
  try {
    const { accountId } = req.query as { accountId?: string };
    if (!accountId) throw new ApiError('缺少 accountId', 400, 'VALIDATION_ERROR');
    const rows = await listLedger(accountId, Number(req.query.limit) || 50);
    sendSuccess(res, rows);
  } catch (e) { next(e); }
});

/** 待核对账单（运营复核） */
aiCreditRoutes.get('/admin/pending-bills', adminOnly, async (req, res, next) => {
  try {
    sendSuccess(res, await listPendingBills((req.query.accountId as string) || undefined));
  } catch (e) { next(e); }
});

/* ==================== 机构端（manager） ==================== */

/** 本机构员工授权列表 */
aiCreditRoutes.get('/employees', requireMinRole('manager'), async (_req, res, next) => {
  try {
    // 员工授权已按产品规则取消（管理员专属 AI）；端点保留空实现以兼容旧客户端
    sendSuccess(res, []);
  } catch (e) { next(e); }
});
aiCreditRoutes.get('/account', requireMinRole('manager'), async (req, res, next) => {
  try {
    const { account } = await requireOwnAccount(req);
    const [inAgg, outAgg] = await Promise.all([
      prisma.aiCreditLedger.aggregate({ _sum: { micros: true }, where: { accountId: account.id, micros: { gt: 0 } } }),
      prisma.aiCreditLedger.aggregate({ _sum: { micros: true }, where: { accountId: account.id, micros: { lt: 0 } } }),
    ]);
    sendSuccess(res, {
      id: account.id,
      status: account.status,
      balance: fmtMicros(account.balanceMicros),
      reserved: fmtMicros(account.reservedMicros),
      available: fmtMicros(account.balanceMicros - account.reservedMicros),
      totalTopup: fmtMicros(inAgg._sum.micros ?? 0),
      used: fmtMicros(-(outAgg._sum.micros ?? 0)),
      fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    });
  } catch (e) { next(e); }
});

/** 本机构消费账单（manager 看全机构） */
aiCreditRoutes.get('/bills', requireMinRole('manager'), async (req, res, next) => {
  try {
    const { account } = await requireOwnAccount(req);
    const rows = await prisma.aiTaskBill.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 100, 200),
    });
    sendSuccess(res, rows);
  } catch (e) { next(e); }
});

/** 本机构积分流水（manager 看自己机构） */
aiCreditRoutes.get('/ledger', requireMinRole('manager'), async (req, res, next) => {
  try {
    const { account } = await requireOwnAccount(req);
    sendSuccess(res, await listLedger(account.id, Number(req.query.limit) || 50));
  } catch (e) { next(e); }
});

/* ==================== 员工端 ==================== */

/** 我的 AI 任务记录 */
aiCreditRoutes.get('/my-bills', async (req, res, next) => {
  try {
    const user = getUser(req);
    const account = await prisma.aiCreditAccount.findFirst({
      where: { organizationId: user.organizationId, campusId: user.campusId ?? null },
    });
    if (!account) return sendSuccess(res, []);
    const rows = await prisma.aiTaskBill.findMany({
      where: { accountId: account.id, userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    sendSuccess(res, rows);
  } catch (e) { next(e); }
});
