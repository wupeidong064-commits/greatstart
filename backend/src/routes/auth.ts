import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { generateSecurePassword, securityConfig } from '../config/security';
import { authenticate, AuthRequest, sessionTag } from '../middleware/auth';
import { requireMinRole, platformOnly } from '../middleware/rbac';
import {
  createManaged,
  validPassword,
  validEmail,
  normalizePhone,
  loginIdentity,
  textField,
  fail,
  userFields,
} from '../services/managedUsers';
import { sendSuccess } from '../utils/response';
import { ApiError } from '../middleware/errorHandler';
import { sessionUser, lockManagement } from '../services/managementAccess';
import { createDefaultCampus } from '../services/organizationScope';
import { accountAvatarController, avatarUpload } from '../controllers/accountAvatarController';

export const authRoutes = Router();
const profile = {
  ...userFields,
  isPlatformAdmin: true,
  organization: { select: { id: true, name: true, code: true, isActive: true } },
  campus: { select: { id: true, name: true, code: true, isActive: true, organizationId: true } },
} as const;
authRoutes.post(['/register', '/register-phone'], (_req, _res, next) =>
  next(new ApiError('请先提交机构开通申请；员工与家长账号由校区创建', 403, 'APPLICATION_REQUIRED'))
);
authRoutes.post(['/send-otp', '/verify-otp', '/reset-password'], (_req, _res, next) =>
  next(new ApiError('本系统使用密码登录；忘记密码请联系管理员', 409, 'SMS_UNAVAILABLE'))
);
authRoutes.post(['/login', '/login-phone'], async (req, res, next) => {
  try {
    const byPhone = req.path === '/login-phone' || req.body.phone != null;
    const identity = byPhone ? normalizePhone(req.body.phone) : validEmail(req.body.email);
    const users = await prisma.user.findMany({
      where: byPhone ? { phone: identity } : { email: { equals: identity, mode: 'insensitive' } },
      take: 2,
      select: { ...profile, password: true },
    });
    if (
      users.length !== 1 ||
      typeof req.body.password !== 'string' ||
      !(await bcrypt.compare(req.body.password, users[0].password))
    )
      throw new ApiError('账号或密码错误', 401, 'INVALID_CREDENTIALS');
    const { password, ...user } = users[0];
    if (
      !user.isActive ||
      (!user.isPlatformAdmin &&
        (user.organization?.isActive === false ||
          user.campus?.isActive === false ||
          (user.campus && user.campus.organizationId !== user.organizationId)))
    )
      fail('账号、机构或校区已停用', 403);
    const token = jwt.sign(
      { userId: user.id, role: user.role, sessionTag: sessionTag(password) },
      securityConfig.jwt.secret,
      { algorithm: 'HS256', jwtid: randomUUID(), expiresIn: securityConfig.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
    );
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    sendSuccess(res, { token, user: sessionUser(user) }, '登录成功');
  } catch (e) {
    next(e);
  }
});
authRoutes.post('/logout', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const session = req.authSession;
    if (!session) throw new ApiError('请重新登录', 401, 'SESSION_EXPIRED');
    await prisma.$transaction([
      prisma.revokedAuthSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
      prisma.revokedAuthSession.upsert({ where: { tokenHash: session.tokenHash }, create: session, update: {} }),
    ]);
    sendSuccess(res, null, '已退出登录');
  } catch (e) {
    next(e);
  }
});
authRoutes.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    sendSuccess(res, sessionUser(await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: profile })));
  } catch (e) {
    next(e);
  }
});
authRoutes.get('/avatar', authenticate, accountAvatarController.get);
authRoutes.post('/avatar', authenticate, avatarUpload, accountAvatarController.save);
authRoutes.delete('/avatar', authenticate, accountAvatarController.remove);
authRoutes.post('/change-password', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const nextPassword = validPassword(req.body.newPassword),
      actor = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (
      typeof req.body.oldPassword !== 'string' ||
      !(await bcrypt.compare(req.body.oldPassword, actor.password))
    )
      fail('原密码不正确');
    const r = await prisma.user.updateMany({
      where: { id: actor.id, password: actor.password },
      data: { password: await bcrypt.hash(nextPassword, 10) },
    });
    if (r.count !== 1) fail('密码已变更，请重新登录', 409);
    sendSuccess(res, null, '密码已修改，请重新登录');
  } catch (e) {
    next(e);
  }
});
authRoutes.post(
  ['/create-manager', '/create-manager-phone'],
  authenticate,
  platformOnly,
  async (req: AuthRequest, res, next) => {
    try {
      sendSuccess(res, await createManaged(req, 'manager'), '管理账号已创建', 201);
    } catch (e) {
      next(e);
    }
  }
);
authRoutes.post(
  ['/create-staff', '/create-parent'],
  authenticate,
  requireMinRole('manager'),
  async (req: AuthRequest, res, next) => {
    try {
      if (req.path === '/create-staff' && !['teacher', 'coach', 'sales', 'staff'].includes(req.body.role))
        fail('只能创建员工', 403);
      sendSuccess(
        res,
        await createManaged(req, req.path === '/create-parent' ? 'parent' : req.body.role),
        '账号已创建',
        201
      );
    } catch (e) {
      next(e);
    }
  }
);
// 2026-11-08 用户拍板（⑫）：家长账号一键恢复默认密码（=登录手机号），解决家长忘密码
authRoutes.post(
  '/reset-parent-password',
  authenticate,
  requireMinRole('manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const actor = req.user!;
      if (!actor.organizationId) fail('需要机构身份', 403);
      const phone = normalizePhone(req.body.phone);
      const target = await prisma.user.findFirst({
        where: { phone, organizationId: actor.organizationId, role: 'parent' },
        select: { id: true, isActive: true },
      });
      if (!target) throw new ApiError('未找到该手机号对应的家长账号，请先创建', 404, 'PARENT_NOT_FOUND');
      if (!target.isActive) throw new ApiError('该家长账号已停用，请先启用', 409, 'PARENT_INACTIVE');
      await prisma.user.update({ where: { id: target.id }, data: { password: await bcrypt.hash(phone, 10) } });
      sendSuccess(res, { phone }, '密码已恢复为默认（与登录手机号相同）');
    } catch (e) {
      next(e);
    }
  }
);
authRoutes.post('/applications', async (req, res, next) => {
  try {
    const data = {
      organizationName: textField(req.body.organizationName, '机构名称'),
      contactName: textField(req.body.contactName, '联系人'),
      ...loginIdentity(req.body),
    };
    try {
      await prisma.campusApplication.create({ data });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    sendSuccess(res, null, '申请已收到，请等待平台联系', 202);
  } catch (e) {
    next(e);
  }
});
authRoutes.get('/applications', authenticate, platformOnly, async (req, res, next) => {
  try {
    sendSuccess(
      res,
      await prisma.campusApplication.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        take: 100,
      })
    );
  } catch (e) {
    next(e);
  }
});
authRoutes.post(
  '/applications/:id/review',
  authenticate,
  platformOnly,
  async (req: AuthRequest, res, next) => {
    try {
      const action = req.body.action;
      if (!['approve', 'reject'].includes(action)) fail('审核操作无效');
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.campusApplication.updateMany({
          where: { id: req.params.id, status: 'pending' },
          data: {
            status: action === 'approve' ? 'approved' : 'rejected',
            reviewedById: req.user!.id,
            reviewedAt: new Date(),
          },
        });
        if (updated.count !== 1) fail('申请已处理或不存在', 409);
        if (action === 'reject') return null;
        const app = await tx.campusApplication.findUniqueOrThrow({ where: { id: req.params.id } });
        const org = await tx.organization.create({
          data: { name: app.organizationName, code: 'ORG-' + randomUUID() },
        });
        const campus = await createDefaultCampus(tx, org.id);
        const password = generateSecurePassword();
        await lockManagement(tx, org.id);
        const appointed = await tx.user.create({
          data: {
            email: app.email,
            phone: app.phone,
            password: await bcrypt.hash(password, 10),
            name: app.contactName,
            organizationId: org.id,
            campusId: campus.id,
            role: 'staff',
            managementLevel: 'super',
            managementGrantedById: req.user!.id,
            managementGrantedAt: new Date(),
          },
        });
        await tx.userManagementEvent.create({ data: { organizationId: org.id, actorId: req.user!.id, userId: appointed.id, fromLevel: 'none', toLevel: 'super', jobRole: 'staff', origin: 'platform-application' } });
        await tx.campusApplication.update({ where: { id: app.id }, data: { organizationId: org.id } });
        return { email: app.email, phone: app.phone, defaultPassword: password };
      });
      res.set('Cache-Control', 'no-store');
      sendSuccess(res, result, '审核已完成');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return next(new ApiError('该手机号或邮箱已有账号，请核对后处理', 409, 'IDENTITY_EXISTS'));
      next(e);
    }
  }
);

// Add siblings to an existing verified parent without creating another login.
authRoutes.post(
  '/parent-bindings',
  authenticate,
  requireMinRole('manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const u = req.user!,
        { parentId, studentId } = req.body;
      if (!u.organizationId || !u.campusId || typeof parentId !== 'string' || typeof studentId !== 'string')
        fail('需要校区、家长和学员');
      const scope = { organizationId: u.organizationId, campusId: u.campusId };
      await prisma.$transaction(async (tx) => {
        const parent = await tx.user.findFirst({
          where: { id: parentId, ...scope, role: 'parent', isActive: true },
        });
        if (
          !parent?.phone ||
          !(await tx.student.findFirst({ where: { id: studentId, ...scope, parentPhone: parent.phone } }))
        )
          fail('请核对本校区家长账号与学员档案中的家长电话', 403);
        await tx.parentStudentLink.upsert({
          where: { parentId_studentId: { parentId, studentId } },
          create: { parentId, studentId },
          update: {},
        });
      });
      sendSuccess(res, null, '学员已绑定');
    } catch (e) {
      next(e);
    }
  }
);
authRoutes.delete(
  '/parent-bindings/:parentId/:studentId',
  authenticate,
  requireMinRole('manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const u = req.user!;
      if (!u.organizationId || !u.campusId) fail('需要校区身份', 403);
      const { parentId, studentId } = req.params,
        scope = { organizationId: u.organizationId, campusId: u.campusId };
      const r = await prisma.parentStudentLink.deleteMany({
        where: { parentId, studentId, parent: scope, student: scope },
      });
      if (!r.count) fail('绑定关系不存在', 404);
      sendSuccess(res, null, '已解除绑定');
    } catch (e) {
      next(e);
    }
  }
);
