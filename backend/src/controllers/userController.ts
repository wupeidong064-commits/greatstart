import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { personnelOptions, teachingPerformance, salesPerformance } from '../services/personnelStatisticsService';
import prisma from '../config/database';
import { assertEditableAccount, lockManagement, staffUser, changeManagement, effectiveRole } from '../services/managementAccess';
import { lockScheduleWrites } from '../services/scheduleConflicts';
import { experienceScopeWhere } from '../utils/experienceScope';
import { dormantResourceWhere } from '../services/studentResponsibility';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { generateSecurePassword } from '../config/security';
import { logger } from '../middleware/logger';
import {
  createManaged,
  staffScope,
  userFields,
  employeeRoles,
  textField,
  fail,
  normalizePhone,
  validEmail,
} from '../services/managedUsers';

// Caller holds the institution class-write lock until the account update commits.
async function assertStaffCanBeDisabled(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  // Paused/empty classes still need a responsible teacher. Deleted classes
  // and completed historical occurrences keep their attribution without blocking.
  const classes = await tx.class.findMany({
    where: { organizationId, teacherId: userId, status: { not: 'deleted' } },
    select: { id: true, _count: { select: { enrollments: { where: { status: 'active' } } } } },
  });
  const owner = await tx.user.findUnique({ where: { id: userId }, select: { campusId: true } });
  const campusId = owner?.campusId;
  const { organizationId: _org, campusId: _campus, ...recallResources } = dormantResourceWhere({ organizationId, campusId: campusId || '__unassigned__' });
  const [leads, experiences, students] = await Promise.all([
    tx.lead.count({ where: { organizationId, assigneeId: userId, status: { notIn: ['converted', 'lost'] } } }),
    tx.experienceLesson.count({ where: { organizationId, assigneeId: userId, status: { notIn: ['converted', 'cancelled'] } } }),
    tx.student.count({ where: { organizationId, recallTeacherId: userId, ...recallResources } }),
  ]);
  if (classes.length || leads || experiences || students) {
    const [localClasses, localExperiences, localStudents] = campusId ? await Promise.all([
      tx.class.count({ where: { organizationId, campusId, teacherId: userId, status: { not: 'deleted' } } }),
      tx.experienceLesson.count({ where: { ...experienceScopeWhere(organizationId, campusId), assigneeId: userId, status: { notIn: ['converted', 'cancelled'] } } }),
      tx.student.count({ where: { ...dormantResourceWhere({ organizationId, campusId }), recallTeacherId: userId } }),
    ]) : [0, 0, 0];
    if (localClasses !== classes.length || localExperiences !== experiences || localStudents !== students)
      throw new ApiError('该工作人员存在其他校区或未归属校区的待交接资源，请联系平台管理员核对处理后再停用或删除。', 409, 'STAFF_CROSS_CAMPUS_RESPONSIBILITIES');
    const items = [classes.length && `${classes.length} 个班级`, leads && `${leads} 条鱼池线索`, experiences && `${experiences} 条体验课`, students && `${students} 名待回访学员`].filter(Boolean).join('、');
    throw new ApiError(`该工作人员仍负责 ${items}，请先在“资源交接”中处理，再停用或删除。`, 409, 'STAFF_HAS_RESPONSIBILITIES');
  }
}

// Caller holds management and class-write locks through the job change. Sales
// follow-ups can stay with a sales/staff account; teaching and recall work cannot.
async function assertTeachingResourcesTransferred(tx: Prisma.TransactionClient, organizationId: string, userId: string, campusId: string | null) {
  const { organizationId: _org, campusId: _campus, ...recallResources } = dormantResourceWhere({ organizationId, campusId: campusId || '__unassigned__' });
  const [classes, students] = await Promise.all([
    tx.class.count({ where: { organizationId, teacherId: userId, status: { not: 'deleted' } } }),
    tx.student.count({ where: { organizationId, recallTeacherId: userId, ...recallResources } }),
  ]);
  if (classes || students) {
    const items = [classes && `${classes} 个班级（含停课班、空班）`, students && `${students} 名待回访学员`].filter(Boolean).join('、');
    throw new ApiError(`该老师仍负责 ${items}，请先在“资源交接”中完成班级和沉默学员交接，再改为非教师岗位。`, 409, 'TEACHER_ROLE_HAS_RESPONSIBILITIES');
  }
}

export const userController = {
  getUsers: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = staffScope(req),
        role = String(req.query.role || '')
          .split(',')
          .filter(Boolean),
        q = String(req.query.search || '').trim();
      const page = Math.max(1, Number(req.query.page) | 0),
        pageSize = Math.max(1, Math.min(1000, Number(req.query.pageSize || 10) | 0));
      const where = {
        ...scope,
        ...(role.length ? { role: { in: role } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { email: { contains: q } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      };
      const [rows, count] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          select: userFields,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        prisma.user.count({ where }),
      ]);
      sendPaginated(res, rows.map(staffUser), page, pageSize, count);
    } catch (e) {
      next(e);
    }
  },
  getUserById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const row = await prisma.user.findFirst({
        where: { id: req.params.id, ...staffScope(req) },
        select: userFields,
      });
      if (!row) fail('用户不存在', 404);
      sendSuccess(res, staffUser(row!));
    } catch (e) {
      next(e);
    }
  },
  createUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, await createManaged(req, req.body.role), '账号已创建', 201);
    } catch (e) {
      next(e);
    }
  },
  updateUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!,
        scope = staffScope(req);
      const target = await prisma.user.findFirst({
        where: { ...scope, id: req.params.id },
        select: userFields,
      });
      if (!target) throw new ApiError('用户不存在', 404);
      const { role, name, phone, email, isActive } = req.body;
      const expected = req.body.expectedUpdatedAt;
      if (expected !== undefined && (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected))))
        fail('账号版本无效，请刷新人员列表后重试');
      // Current clients send the opened form's version. Older clients still get
      // a compare-and-swap baseline for changes occurring during this request.
      const expectedTime = expected === undefined ? target.updatedAt : new Date(expected);
      if (Object.prototype.hasOwnProperty.call(req.body, 'password'))
        fail('请通过“重置密码”操作修改工作人员密码', 403);
      if (['managementLevel','managementGrantedById','managementGrantedAt','isPlatformAdmin'].some(key => key in req.body) || (role !== undefined && !employeeRoles.includes(role)))
        fail('管理身份请通过“设为／取消机构管理员”专用操作调整', 403);
      if (target.role === 'parent' && (role || phone !== undefined || email !== undefined))
        fail('家长绑定关系不能通过员工编辑变更', 403);
      if (req.body.campusId && req.body.campusId !== target.campusId)
        fail('不能通过员工编辑变更校区');
      const normalizedPhone =
        phone === undefined
          ? undefined
          : phone === null || phone === ''
            ? null
            : normalizePhone(phone);
      const normalizedEmail = email === undefined ? undefined :
        email === null || (typeof email === 'string' && !email.trim()) ? null : validEmail(email);
      if (isActive !== undefined && typeof isActive !== 'boolean') fail('启用状态无效');
      const changed = await prisma.$transaction(async tx => {
        await lockManagement(tx, scope.organizationId);
        const latestActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
        if (!latestActor.isActive || latestActor.organizationId !== scope.organizationId || latestActor.campusId !== actor.campusId || !['admin','manager'].includes(effectiveRole(latestActor))) fail('管理权限已变化，请刷新后重试', 403);
        const current = await tx.user.findFirstOrThrow({ where: { id: target.id, ...scope }, select: userFields });
        assertEditableAccount({ ...actor, managementLevel: latestActor.managementLevel }, current, isActive === false);
        if (current.updatedAt.getTime() !== expectedTime.getTime())
          throw new ApiError('账号资料已变化，请重新打开编辑窗口后再修改', 409, 'ACCOUNT_CHANGED');
        if (normalizedPhone !== undefined && normalizedPhone !== current.phone &&
            latestActor.managementLevel !== 'super' && !latestActor.isPlatformAdmin) {
          fail('仅超级机构管理员可修改登录手机号', 403);
        }
        if (normalizedEmail !== undefined && normalizedEmail !== (current.email?.trim().toLowerCase() || null) &&
            latestActor.managementLevel !== 'super' && !latestActor.isPlatformAdmin) {
          fail('仅超级机构管理员可修改登录邮箱', 403);
        }
        if (normalizedPhone !== undefined || normalizedEmail !== undefined) {
          const nextPhone = normalizedPhone === undefined ? current.phone : normalizedPhone;
          const nextEmail = normalizedEmail === undefined ? current.email : normalizedEmail;
          if (!nextPhone && !nextEmail) fail('手机号和邮箱至少保留一项，不能移除唯一登录方式');
        }
        if (normalizedEmail && await tx.user.findFirst({
          where: { email: { equals: normalizedEmail, mode: 'insensitive' }, id: { not: current.id } },
          select: { id: true },
        })) throw new ApiError('邮箱已被其他账号使用', 409, 'IDENTITY_EXISTS');

        const leavingTeaching = ['teacher', 'coach'].includes(current.role) && role !== undefined && !['teacher', 'coach'].includes(role);
        if (isActive === false || leavingTeaching) {
          await lockScheduleWrites(tx, scope.organizationId);
        }
        if (leavingTeaching) {
          await assertTeachingResourcesTransferred(tx, scope.organizationId, target.id, current.campusId);
        }
        if (isActive === false) {
          await assertStaffCanBeDisabled(tx, scope.organizationId, target.id);
        }
        return tx.user.updateMany({
          where: { id: target.id, ...scope, updatedAt: expectedTime },
          data: {
            ...(name !== undefined ? { name: textField(name, '姓名') } : {}),
            ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
            ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
            role,
            isActive,
            updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
          },
        });
      });
      if (!changed.count) fail('账号已变更，请刷新', 409);
      sendSuccess(
        res,
        staffUser(await prisma.user.findFirstOrThrow({ where: { id: target.id, ...scope }, select: userFields }))
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return next(new ApiError(String(e.meta?.target || '').includes('email') ? '邮箱已被其他账号使用' : '手机号已被其他账号使用', 409, 'IDENTITY_EXISTS'));
      next(e);
    }
  },
  resetStaffPassword: async (req: AuthRequest, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const actor = req.user!, scope = staffScope(req);
      if (actor.managementLevel !== 'super') fail('仅超级机构管理员可重置工作人员密码', 403);
      if (req.params.id === actor.id) fail('请通过个人菜单修改自己的密码', 409);
      const expected = req.body.expectedUpdatedAt;
      if (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected)))
        fail('请刷新人员列表后重新确认重置');
      if ('password' in req.body || 'newPassword' in req.body) fail('新密码由系统生成，无需提交密码');
      const expectedTime = new Date(expected);
      const newPassword = generateSecurePassword();
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const account = await prisma.$transaction(async tx => {
        await lockManagement(tx, scope.organizationId);
        const latestActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
        if (!latestActor.isActive || latestActor.organizationId !== scope.organizationId ||
            latestActor.campusId !== actor.campusId || latestActor.managementLevel !== 'super')
          fail('管理权限已变化，请刷新后重试', 403);
        const target = await tx.user.findFirst({
          where: { ...scope, id: req.params.id },
          select: { ...userFields, password: true },
        });
        if (!target) throw new ApiError('工作人员不存在或不属于本机构', 404);
        assertEditableAccount({ ...actor, managementLevel: latestActor.managementLevel }, target);
        if (target.role === 'parent') fail('请通过学员管理处理家长账号密码', 403);
        if (!target.isActive) fail('该工作人员已停用，不能重置密码', 409);
        if (target.updatedAt.getTime() !== expectedTime.getTime())
          throw new ApiError('账号资料已变化，请刷新列表后重新确认重置', 409, 'ACCOUNT_CHANGED');
        const changed = await tx.user.updateMany({
          where: { ...scope, id: target.id, isActive: true, password: target.password, updatedAt: expectedTime },
          data: { password: passwordHash },
        });
        if (changed.count !== 1)
          throw new ApiError('账号资料已变化，请刷新列表后重新确认重置', 409, 'ACCOUNT_CHANGED');
        return { id: target.id, name: target.name, phone: target.phone, email: target.email };
      });
      // Never include the generated password or password hash in audit logs.
      try { logger.audit('staff-password-reset', { actorId: actor.id, targetId: account.id, organizationId: scope.organizationId }); }
      catch { console.warn('工作人员密码已重置，审计日志写入失败'); }
      sendSuccess(res, { ...account, newPassword }, '密码已重置，新密码仅本次显示');
    } catch (e) { next(e); }
  },
  deleteUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      if (req.params.id === actor.id) fail('不能停用自己的账号', 409);
      const scope = staffScope(req);
      await prisma.$transaction(async tx => {
        await lockManagement(tx, scope.organizationId);
        const latestActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
        if (!latestActor.isActive || latestActor.organizationId !== scope.organizationId || latestActor.campusId !== actor.campusId || !['admin','manager'].includes(effectiveRole(latestActor))) fail('管理权限已变化，请刷新后重试', 403);
        // Share the class/transfer write lock: a new responsibility cannot appear
        // between the ownership check and disabling this account.
        await lockScheduleWrites(tx, scope.organizationId);
        const where = {
          ...scope,
          id: req.params.id,
          role: {
            in: [...employeeRoles, 'parent', 'admin', 'manager', 'super_admin'],
          },
        };
        const target = await tx.user.findFirst({ where, select: userFields });
        if (!target) fail('无权停用此账号', 403);
        assertEditableAccount({ ...actor, managementLevel: latestActor.managementLevel }, target!, true);
        await assertStaffCanBeDisabled(tx, scope.organizationId, req.params.id);
        const result = await tx.user.updateMany({ where, data: { isActive: false } });
        if (!result.count) fail('账号已变更，请刷新', 409);
      });
      sendSuccess(res, null, '账号已停用，业务记录已保留');
    } catch (e) {
      next(e);
    }
  },
  changeManagement: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, await changeManagement(req.user!, staffScope(req).organizationId, req.params.id, req.body.managementLevel, req.body.expectedLevel), '管理身份已更新');
    } catch (e) { next(e); }
  },
  getTeachers: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await personnelOptions(req)); }
    catch (error) { next(error); }
  },

  getCoachStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await teachingPerformance(req)); }
    catch (error) { next(error); }
  },

  getSalesStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await salesPerformance(req)); }
    catch (error) { next(error); }
  },
};
