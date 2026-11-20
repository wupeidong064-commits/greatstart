"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiCreditRoutes = void 0;
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
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const database_1 = __importDefault(require("../config/database"));
const aiCredits_1 = require("../config/aiCredits");
const aiCreditAdminService_1 = require("../services/aiCreditAdminService");
exports.aiCreditRoutes = (0, express_1.Router)();
exports.aiCreditRoutes.use(auth_1.authenticate);
/** 套餐配置（登录即可读，用于页面展示） */
exports.aiCreditRoutes.get('/packages', async (_req, res, next) => {
    try {
        const { AI_PACKAGES, CREDITS_PER_YUAN } = await Promise.resolve().then(() => __importStar(require('../config/aiCredits')));
        (0, response_1.sendSuccess)(res, { packages: AI_PACKAGES, creditsPerYuan: CREDITS_PER_YUAN });
    }
    catch (e) {
        next(e);
    }
});
exports.aiCreditRoutes.use((0, rbac_1.requireOrganizationAccess)());
const getUser = (req) => req.user;
/** 解析当前用户的机构账户（无则 404 语义错误） */
async function requireOwnAccount(req) {
    const user = getUser(req);
    const account = await database_1.default.aiCreditAccount.findFirst({
        where: { organizationId: user.organizationId, campusId: user.campusId ?? null },
    });
    if (!account) {
        throw new errorHandler_1.ApiError('本机构尚未开通 AI 服务', 404, 'AI_NOT_ENABLED');
    }
    return { user, account };
}
/* ==================== 平台端（平台运营身份，独立于租户角色） ==================== */
/** 平台运营校验：要求 User.isPlatformAdmin（独立授予），租户 admin/manager 均不放行（P0-01） */
const requirePlatformAdmin = (req, _res, next) => {
    const user = getUser(req);
    if (!user?.isPlatformAdmin) {
        return next(new errorHandler_1.ApiError('需要平台运营权限（独立授予）', 403, 'PLATFORM_ADMIN_REQUIRED'));
    }
    next();
};
const adminOnly = requirePlatformAdmin;
/** 开通（首次，按机构+机构组合；校验机构归属） */
exports.aiCreditRoutes.post('/admin/open', adminOnly, async (req, res, next) => {
    try {
        const { organizationId, campusId } = req.body ?? {};
        if (!organizationId)
            throw new errorHandler_1.ApiError('缺少 organizationId', 400, 'VALIDATION_ERROR');
        const r = await (0, aiCreditAdminService_1.openAccount)(getUser(req), organizationId, campusId ?? null);
        (0, response_1.sendSuccess)(res, r, r.alreadyOpened ? '机构 AI 已开通' : '机构 AI 开通成功', 201);
    }
    catch (e) {
        next(e);
    }
});
/** 启用既有账户（按 accountId 精确启用原账户，不再新建机构级账户，P1-04） */
exports.aiCreditRoutes.post('/admin/enable', adminOnly, async (req, res, next) => {
    try {
        const { accountId } = req.body ?? {};
        if (!accountId)
            throw new errorHandler_1.ApiError('缺少 accountId', 400, 'VALIDATION_ERROR');
        await (0, aiCreditAdminService_1.enableAccountById)(accountId);
        (0, response_1.sendSuccess)(res, { ok: true }, '已启用原账户');
    }
    catch (e) {
        next(e);
    }
});
/** 配置模型价格版本（平台运营；未配置的模型会被拒绝调用） */
exports.aiCreditRoutes.post('/admin/prices', adminOnly, async (req, res, next) => {
    try {
        const { model, inputMicrosPer1k, outputMicrosPer1k, note } = req.body ?? {};
        if (!model || !inputMicrosPer1k || !outputMicrosPer1k) {
            throw new errorHandler_1.ApiError('缺少 model / inputMicrosPer1k / outputMicrosPer1k', 400, 'VALIDATION_ERROR');
        }
        const { publishPriceVersion } = await Promise.resolve().then(() => __importStar(require('../services/aiCreditService')));
        const r = await publishPriceVersion(String(model), Number(inputMicrosPer1k), Number(outputMicrosPer1k), note);
        (0, response_1.sendSuccess)(res, r, '价格版本已发布', 201);
    }
    catch (e) {
        next(e);
    }
});
/** 待核对账单复核（write_off 核销 / charge 核定扣款） */
exports.aiCreditRoutes.post('/admin/review-bill', adminOnly, async (req, res, next) => {
    try {
        const { billId, action, actualMicros } = req.body ?? {};
        if (!billId || !['write_off', 'charge'].includes(action)) {
            throw new errorHandler_1.ApiError('缺少 billId 或 action 非法', 400, 'VALIDATION_ERROR');
        }
        const r = await (0, aiCreditAdminService_1.reviewBill)({ operator: getUser(req), billId, action, actualMicros: Number(actualMicros) || 0 });
        (0, response_1.sendSuccess)(res, r, action === 'write_off' ? '已核销（不扣费）' : '已按核定金额扣款');
    }
    catch (e) {
        next(e);
    }
});
/** 停用机构 AI */
exports.aiCreditRoutes.post('/admin/disable', adminOnly, async (req, res, next) => {
    try {
        const { accountId, reason } = req.body ?? {};
        if (!accountId)
            throw new errorHandler_1.ApiError('缺少 accountId', 400, 'VALIDATION_ERROR');
        await (0, aiCreditAdminService_1.disableAccount)(accountId, reason ?? '');
        (0, response_1.sendSuccess)(res, { ok: true }, '已停用机构 AI（余额保留）');
    }
    catch (e) {
        next(e);
    }
});
/** 人工入账（套餐或自定义积分；幂等） */
exports.aiCreditRoutes.post('/admin/topup', adminOnly, async (req, res, next) => {
    try {
        const { accountId, packageCode, credits, yuanAmount, reason, idempotencyKey } = req.body ?? {};
        if (!accountId || !idempotencyKey || !reason) {
            throw new errorHandler_1.ApiError('缺少 accountId / reason / idempotencyKey', 400, 'VALIDATION_ERROR');
        }
        const r = await (0, aiCreditAdminService_1.topupAccount)({
            operator: getUser(req),
            accountId,
            packageCode,
            credits,
            yuanAmount,
            reason,
            idempotencyKey: String(idempotencyKey),
        });
        (0, response_1.sendSuccess)(res, r, r.duplicate ? '重复请求已忽略（未重复入账）' : '入账成功', 201);
    }
    catch (e) {
        next(e);
    }
});
/** 赠送积分（adjust 类；幂等） */
exports.aiCreditRoutes.post('/admin/adjust', adminOnly, async (req, res, next) => {
    try {
        const { accountId, credits, reason, idempotencyKey } = req.body ?? {};
        if (!accountId || !idempotencyKey || !reason || credits == null) {
            throw new errorHandler_1.ApiError('缺少必要字段', 400, 'VALIDATION_ERROR');
        }
        await (0, aiCreditAdminService_1.adjustAccount)({
            operator: getUser(req),
            accountId,
            credits: Number(credits),
            reason: `[赠送] ${reason}`,
            idempotencyKey: String(idempotencyKey),
        });
        (0, response_1.sendSuccess)(res, { ok: true }, '赠送积分已入账', 201);
    }
    catch (e) {
        next(e);
    }
});
/** 平台账户列表 */
exports.aiCreditRoutes.get('/admin/accounts', adminOnly, async (_req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, await (0, aiCreditAdminService_1.listAdminAccounts)());
    }
    catch (e) {
        next(e);
    }
});
/** 平台查流水（按账户） */
exports.aiCreditRoutes.get('/admin/ledger', adminOnly, async (req, res, next) => {
    try {
        const { accountId } = req.query;
        if (!accountId)
            throw new errorHandler_1.ApiError('缺少 accountId', 400, 'VALIDATION_ERROR');
        const rows = await (0, aiCreditAdminService_1.listLedger)(accountId, Number(req.query.limit) || 50);
        (0, response_1.sendSuccess)(res, rows);
    }
    catch (e) {
        next(e);
    }
});
/** 待核对账单（运营复核） */
exports.aiCreditRoutes.get('/admin/pending-bills', adminOnly, async (req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, await (0, aiCreditAdminService_1.listPendingBills)(req.query.accountId || undefined));
    }
    catch (e) {
        next(e);
    }
});
/* ==================== 机构端（manager） ==================== */
/** 本机构员工授权列表 */
exports.aiCreditRoutes.get('/employees', (0, rbac_1.requireMinRole)('manager'), async (_req, res, next) => {
    try {
        // 员工授权已按产品规则取消（管理员专属 AI）；端点保留空实现以兼容旧客户端
        (0, response_1.sendSuccess)(res, []);
    }
    catch (e) {
        next(e);
    }
});
exports.aiCreditRoutes.get('/account', (0, rbac_1.requireMinRole)('manager'), async (req, res, next) => {
    try {
        const { account } = await requireOwnAccount(req);
        const [inAgg, outAgg] = await Promise.all([
            database_1.default.aiCreditLedger.aggregate({ _sum: { micros: true }, where: { accountId: account.id, micros: { gt: 0 } } }),
            database_1.default.aiCreditLedger.aggregate({ _sum: { micros: true }, where: { accountId: account.id, micros: { lt: 0 } } }),
        ]);
        (0, response_1.sendSuccess)(res, {
            id: account.id,
            status: account.status,
            balance: (0, aiCredits_1.fmtMicros)(account.balanceMicros),
            reserved: (0, aiCredits_1.fmtMicros)(account.reservedMicros),
            available: (0, aiCredits_1.fmtMicros)(account.balanceMicros - account.reservedMicros),
            totalTopup: (0, aiCredits_1.fmtMicros)(inAgg._sum.micros ?? 0),
            used: (0, aiCredits_1.fmtMicros)(-(outAgg._sum.micros ?? 0)),
            fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        });
    }
    catch (e) {
        next(e);
    }
});
/** 本机构消费账单（manager 看全机构） */
exports.aiCreditRoutes.get('/bills', (0, rbac_1.requireMinRole)('manager'), async (req, res, next) => {
    try {
        const { account } = await requireOwnAccount(req);
        const rows = await database_1.default.aiTaskBill.findMany({
            where: { accountId: account.id },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Number(req.query.limit) || 100, 200),
        });
        (0, response_1.sendSuccess)(res, rows);
    }
    catch (e) {
        next(e);
    }
});
/** 本机构积分流水（manager 看自己机构） */
exports.aiCreditRoutes.get('/ledger', (0, rbac_1.requireMinRole)('manager'), async (req, res, next) => {
    try {
        const { account } = await requireOwnAccount(req);
        (0, response_1.sendSuccess)(res, await (0, aiCreditAdminService_1.listLedger)(account.id, Number(req.query.limit) || 50));
    }
    catch (e) {
        next(e);
    }
});
/* ==================== 员工端 ==================== */
/** 我的 AI 任务记录 */
exports.aiCreditRoutes.get('/my-bills', async (req, res, next) => {
    try {
        const user = getUser(req);
        const account = await database_1.default.aiCreditAccount.findFirst({
            where: { organizationId: user.organizationId, campusId: user.campusId ?? null },
        });
        if (!account)
            return (0, response_1.sendSuccess)(res, []);
        const rows = await database_1.default.aiTaskBill.findMany({
            where: { accountId: account.id, userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        (0, response_1.sendSuccess)(res, rows);
    }
    catch (e) {
        next(e);
    }
});
//# sourceMappingURL=aiCredits.js.map