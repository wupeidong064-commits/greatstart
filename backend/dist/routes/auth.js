"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const security_1 = require("../config/security");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const managedUsers_1 = require("../services/managedUsers");
const response_1 = require("../utils/response");
const errorHandler_1 = require("../middleware/errorHandler");
const managementAccess_1 = require("../services/managementAccess");
const organizationScope_1 = require("../services/organizationScope");
const accountAvatarController_1 = require("../controllers/accountAvatarController");
exports.authRoutes = (0, express_1.Router)();
const profile = {
    ...managedUsers_1.userFields,
    isPlatformAdmin: true,
    organization: { select: { id: true, name: true, code: true, isActive: true } },
    campus: { select: { id: true, name: true, code: true, isActive: true, organizationId: true } },
};
exports.authRoutes.post(['/register', '/register-phone'], (_req, _res, next) => next(new errorHandler_1.ApiError('请先提交机构开通申请；员工与家长账号由校区创建', 403, 'APPLICATION_REQUIRED')));
exports.authRoutes.post(['/send-otp', '/verify-otp', '/reset-password'], (_req, _res, next) => next(new errorHandler_1.ApiError('本系统使用密码登录；忘记密码请联系管理员', 409, 'SMS_UNAVAILABLE')));
exports.authRoutes.post(['/login', '/login-phone'], async (req, res, next) => {
    try {
        const byPhone = req.path === '/login-phone' || req.body.phone != null;
        const identity = byPhone ? (0, managedUsers_1.normalizePhone)(req.body.phone) : (0, managedUsers_1.validEmail)(req.body.email);
        const users = await database_1.default.user.findMany({
            where: byPhone ? { phone: identity } : { email: { equals: identity, mode: 'insensitive' } },
            take: 2,
            select: { ...profile, password: true },
        });
        if (users.length !== 1 ||
            typeof req.body.password !== 'string' ||
            !(await bcryptjs_1.default.compare(req.body.password, users[0].password)))
            throw new errorHandler_1.ApiError('账号或密码错误', 401, 'INVALID_CREDENTIALS');
        const { password, ...user } = users[0];
        if (!user.isActive ||
            (!user.isPlatformAdmin &&
                (user.organization?.isActive === false ||
                    user.campus?.isActive === false ||
                    (user.campus && user.campus.organizationId !== user.organizationId))))
            (0, managedUsers_1.fail)('账号、机构或校区已停用', 403);
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role, sessionTag: (0, auth_1.sessionTag)(password) }, security_1.securityConfig.jwt.secret, { algorithm: 'HS256', jwtid: (0, crypto_1.randomUUID)(), expiresIn: security_1.securityConfig.jwt.expiresIn });
        await database_1.default.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        (0, response_1.sendSuccess)(res, { token, user: (0, managementAccess_1.sessionUser)(user) }, '登录成功');
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.post('/logout', auth_1.authenticate, async (req, res, next) => {
    try {
        const session = req.authSession;
        if (!session)
            throw new errorHandler_1.ApiError('请重新登录', 401, 'SESSION_EXPIRED');
        await database_1.default.$transaction([
            database_1.default.revokedAuthSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
            database_1.default.revokedAuthSession.upsert({ where: { tokenHash: session.tokenHash }, create: session, update: {} }),
        ]);
        (0, response_1.sendSuccess)(res, null, '已退出登录');
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.get('/me', auth_1.authenticate, async (req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, (0, managementAccess_1.sessionUser)(await database_1.default.user.findUniqueOrThrow({ where: { id: req.user.id }, select: profile })));
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.get('/avatar', auth_1.authenticate, accountAvatarController_1.accountAvatarController.get);
exports.authRoutes.post('/avatar', auth_1.authenticate, accountAvatarController_1.avatarUpload, accountAvatarController_1.accountAvatarController.save);
exports.authRoutes.delete('/avatar', auth_1.authenticate, accountAvatarController_1.accountAvatarController.remove);
exports.authRoutes.post('/change-password', auth_1.authenticate, async (req, res, next) => {
    try {
        const nextPassword = (0, managedUsers_1.validPassword)(req.body.newPassword), actor = await database_1.default.user.findUniqueOrThrow({ where: { id: req.user.id } });
        if (typeof req.body.oldPassword !== 'string' ||
            !(await bcryptjs_1.default.compare(req.body.oldPassword, actor.password)))
            (0, managedUsers_1.fail)('原密码不正确');
        const r = await database_1.default.user.updateMany({
            where: { id: actor.id, password: actor.password },
            data: { password: await bcryptjs_1.default.hash(nextPassword, 10) },
        });
        if (r.count !== 1)
            (0, managedUsers_1.fail)('密码已变更，请重新登录', 409);
        (0, response_1.sendSuccess)(res, null, '密码已修改，请重新登录');
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.post(['/create-manager', '/create-manager-phone'], auth_1.authenticate, rbac_1.platformOnly, async (req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, await (0, managedUsers_1.createManaged)(req, 'manager'), '管理账号已创建', 201);
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.post(['/create-staff', '/create-parent'], auth_1.authenticate, (0, rbac_1.requireMinRole)('manager'), async (req, res, next) => {
    try {
        if (req.path === '/create-staff' && !['teacher', 'coach', 'sales', 'staff'].includes(req.body.role))
            (0, managedUsers_1.fail)('只能创建员工', 403);
        (0, response_1.sendSuccess)(res, await (0, managedUsers_1.createManaged)(req, req.path === '/create-parent' ? 'parent' : req.body.role), '账号已创建', 201);
    }
    catch (e) {
        next(e);
    }
});
// 2026-11-08 用户拍板（⑫）：家长账号一键恢复默认密码（=登录手机号），解决家长忘密码
exports.authRoutes.post('/reset-parent-password', auth_1.authenticate, (0, rbac_1.requireMinRole)('manager'), async (req, res, next) => {
    try {
        const actor = req.user;
        if (!actor.organizationId)
            (0, managedUsers_1.fail)('需要机构身份', 403);
        const phone = (0, managedUsers_1.normalizePhone)(req.body.phone);
        const target = await database_1.default.user.findFirst({
            where: { phone, organizationId: actor.organizationId, role: 'parent' },
            select: { id: true, isActive: true },
        });
        if (!target)
            throw new errorHandler_1.ApiError('未找到该手机号对应的家长账号，请先创建', 404, 'PARENT_NOT_FOUND');
        if (!target.isActive)
            throw new errorHandler_1.ApiError('该家长账号已停用，请先启用', 409, 'PARENT_INACTIVE');
        await database_1.default.user.update({ where: { id: target.id }, data: { password: await bcryptjs_1.default.hash(phone, 10) } });
        (0, response_1.sendSuccess)(res, { phone }, '密码已恢复为默认（与登录手机号相同）');
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.post('/applications', async (req, res, next) => {
    try {
        const data = {
            organizationName: (0, managedUsers_1.textField)(req.body.organizationName, '机构名称'),
            contactName: (0, managedUsers_1.textField)(req.body.contactName, '联系人'),
            ...(0, managedUsers_1.loginIdentity)(req.body),
        };
        try {
            await database_1.default.campusApplication.create({ data });
        }
        catch (e) {
            if (!(e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
                throw e;
        }
        (0, response_1.sendSuccess)(res, null, '申请已收到，请等待平台联系', 202);
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.get('/applications', auth_1.authenticate, rbac_1.platformOnly, async (req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, await database_1.default.campusApplication.findMany({
            where: { status: 'pending' },
            orderBy: { createdAt: 'asc' },
            take: 100,
        }));
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.post('/applications/:id/review', auth_1.authenticate, rbac_1.platformOnly, async (req, res, next) => {
    try {
        const action = req.body.action;
        if (!['approve', 'reject'].includes(action))
            (0, managedUsers_1.fail)('审核操作无效');
        const result = await database_1.default.$transaction(async (tx) => {
            const updated = await tx.campusApplication.updateMany({
                where: { id: req.params.id, status: 'pending' },
                data: {
                    status: action === 'approve' ? 'approved' : 'rejected',
                    reviewedById: req.user.id,
                    reviewedAt: new Date(),
                },
            });
            if (updated.count !== 1)
                (0, managedUsers_1.fail)('申请已处理或不存在', 409);
            if (action === 'reject')
                return null;
            const app = await tx.campusApplication.findUniqueOrThrow({ where: { id: req.params.id } });
            const org = await tx.organization.create({
                data: { name: app.organizationName, code: 'ORG-' + (0, crypto_1.randomUUID)() },
            });
            const campus = await (0, organizationScope_1.createDefaultCampus)(tx, org.id);
            const password = (0, security_1.generateSecurePassword)();
            await (0, managementAccess_1.lockManagement)(tx, org.id);
            const appointed = await tx.user.create({
                data: {
                    email: app.email,
                    phone: app.phone,
                    password: await bcryptjs_1.default.hash(password, 10),
                    name: app.contactName,
                    organizationId: org.id,
                    campusId: campus.id,
                    role: 'staff',
                    managementLevel: 'super',
                    managementGrantedById: req.user.id,
                    managementGrantedAt: new Date(),
                },
            });
            await tx.userManagementEvent.create({ data: { organizationId: org.id, actorId: req.user.id, userId: appointed.id, fromLevel: 'none', toLevel: 'super', jobRole: 'staff', origin: 'platform-application' } });
            await tx.campusApplication.update({ where: { id: app.id }, data: { organizationId: org.id } });
            return { email: app.email, phone: app.phone, defaultPassword: password };
        });
        res.set('Cache-Control', 'no-store');
        (0, response_1.sendSuccess)(res, result, '审核已完成');
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            return next(new errorHandler_1.ApiError('该手机号或邮箱已有账号，请核对后处理', 409, 'IDENTITY_EXISTS'));
        next(e);
    }
});
// Add siblings to an existing verified parent without creating another login.
exports.authRoutes.post('/parent-bindings', auth_1.authenticate, (0, rbac_1.requireMinRole)('manager'), async (req, res, next) => {
    try {
        const u = req.user, { parentId, studentId } = req.body;
        if (!u.organizationId || !u.campusId || typeof parentId !== 'string' || typeof studentId !== 'string')
            (0, managedUsers_1.fail)('需要校区、家长和学员');
        const scope = { organizationId: u.organizationId, campusId: u.campusId };
        await database_1.default.$transaction(async (tx) => {
            const parent = await tx.user.findFirst({
                where: { id: parentId, ...scope, role: 'parent', isActive: true },
            });
            if (!parent?.phone ||
                !(await tx.student.findFirst({ where: { id: studentId, ...scope, parentPhone: parent.phone } })))
                (0, managedUsers_1.fail)('请核对本校区家长账号与学员档案中的家长电话', 403);
            await tx.parentStudentLink.upsert({
                where: { parentId_studentId: { parentId, studentId } },
                create: { parentId, studentId },
                update: {},
            });
        });
        (0, response_1.sendSuccess)(res, null, '学员已绑定');
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.delete('/parent-bindings/:parentId/:studentId', auth_1.authenticate, (0, rbac_1.requireMinRole)('manager'), async (req, res, next) => {
    try {
        const u = req.user;
        if (!u.organizationId || !u.campusId)
            (0, managedUsers_1.fail)('需要校区身份', 403);
        const { parentId, studentId } = req.params, scope = { organizationId: u.organizationId, campusId: u.campusId };
        const r = await database_1.default.parentStudentLink.deleteMany({
            where: { parentId, studentId, parent: scope, student: scope },
        });
        if (!r.count)
            (0, managedUsers_1.fail)('绑定关系不存在', 404);
        (0, response_1.sendSuccess)(res, null, '已解除绑定');
    }
    catch (e) {
        next(e);
    }
});
//# sourceMappingURL=auth.js.map