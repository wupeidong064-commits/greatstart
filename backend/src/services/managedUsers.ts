import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { generateSecurePassword } from '../config/security';
import { lockManagement, jobRole, effectiveRole } from './managementAccess';
import { resolveDefaultCampus } from './organizationScope';

export const userFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  campusId: true,
  organizationId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  isPlatformAdmin: true,
  managementLevel: true,
  managementGrantedById: true,
  managementGrantedAt: true,
} as const;
export const employeeRoles = ['staff', 'sales', 'teacher', 'coach'];
export const fail = (message: string, status = 400): never => {
  throw new ApiError(message, status, status === 403 ? 'FORBIDDEN' : 'INVALID_REQUEST');
};
export function textField(v: unknown, label: string, max = 100): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
    throw new ApiError(label + '无效', 400, 'VALIDATION_ERROR');
  return v.trim();
}
export function validEmail(v: unknown) {
  const email = textField(v, '邮箱', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('邮箱格式无效');
  return email;
}
export function normalizePhone(v: unknown): string {
  if (typeof v !== 'string') fail('手机号格式无效');
  const phone = (v as string).replace(/\s/g, '').replace(/^\+86/, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) fail('请输入大陆11位手机号，可带+86及空格');
  return phone;
}
export function loginIdentity(body: { email?: unknown; phone?: unknown }) {
  const email = body.email == null || body.email === '' ? null : validEmail(body.email);
  const phone = body.phone == null || body.phone === '' ? null : normalizePhone(body.phone);
  if (!email && !phone) fail('手机号或邮箱至少填写一项');
  return { email, phone };
}
export function validPassword(v: unknown) {
  if (typeof v !== 'string' || v.length < 8 || Buffer.byteLength(v) > 72)
    throw new ApiError('密码至少 8 位且不得超过 72 字节', 400, 'INVALID_PASSWORD');
  return v;
}
export function staffScope(req: AuthRequest) {
  const u = req.user!;
  if (!u.organizationId) throw new ApiError('需要机构身份', 403, 'FORBIDDEN');
  return {
    organizationId: u.organizationId,
    ...(u.campusId ? { campusId: u.campusId } : {}),
    isPlatformAdmin: false,
  };
}
export async function createManaged(req: AuthRequest, role: string) {
  const actor = req.user!;
  const body = req.body;
  if (['managementLevel', 'isPlatformAdmin', 'managementGrantedById', 'managementGrantedAt'].some(key => key in body)) fail('管理身份请通过专用任命操作设置', 403);
  if (!employeeRoles.includes(role) && !['manager', 'parent'].includes(role)) fail('角色无效', 403);
  if (role === 'manager' && !actor.isPlatformAdmin) fail('无权创建管理账号', 403);
  const org = body.organizationId || actor.organizationId;
  if (
    !org ||
    (!actor.isPlatformAdmin &&
      org !== actor.organizationId)
  )
    fail('无权分配该机构或校区', 403);
  const name = textField(body.name, '姓名');
  const { email, phone } = loginIdentity(body);
  if (role === 'parent' && (!phone || !body.studentId)) fail('创建家长账号需要手机号和关联学员');
  // 2026-11-08 用户拍板：家长账号初始密码默认=登录手机号（随机串交付易抄错）；后台仍可显式指定其他密码。
  const password = body.password
    ? validPassword(body.password)
    : role === 'parent' && phone
      ? phone
      : generateSecurePassword();
  const hash = await bcrypt.hash(password, 10);
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize all creation/reuse for one phone, including the first concurrent request.
      if (phone) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 0))`;
      await lockManagement(tx, org);
      // Permission may have changed while hashing the password or waiting for a
      // phone/management lock. Authorize the write with the current stored identity.
      const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
      if (!currentActor) throw new ApiError('管理账号不存在，请重新登录', 403, 'FORBIDDEN');
      if (!currentActor.isActive ||
          (!currentActor.isPlatformAdmin &&
            (currentActor.organizationId !== org || currentActor.campusId !== actor.campusId ||
              !['admin', 'manager'].includes(effectiveRole(currentActor)))) ||
          (role === 'manager' && !currentActor.isPlatformAdmin))
        fail('管理权限已变化，请刷新后重试', 403);
      const campus = (await resolveDefaultCampus(tx, org)).id;
      if ((body.campusId != null && body.campusId !== campus) ||
          (!currentActor.isPlatformAdmin && currentActor.campusId !== campus))
        fail('无权分配该机构内部范围', 403);
      if (role === 'parent') await tx.$queryRaw`SELECT id FROM students WHERE id = ${body.studentId} FOR UPDATE`;
      const child =
        role === 'parent'
          ? await tx.student.findFirst({
              where: { id: body.studentId, organizationId: org, campusId: campus },
            })
          : null;
      if (role === 'parent' && (!child?.parentPhone || normalizePhone(child.parentPhone) !== phone))
        fail('请核对学员与家长电话', 403);
      const existing = phone ? await tx.user.findUnique({ where: { phone }, select: { ...userFields, isPlatformAdmin: true } }) : null;
      if (existing) {
        if (role !== 'parent' || existing.role !== 'parent' || existing.isPlatformAdmin ||
            !existing.isActive || existing.organizationId !== org || existing.campusId !== campus ||
            (email && email !== existing.email?.trim().toLowerCase())) fail('手机号已被其他账号使用', 409);
        await tx.parentStudentLink.upsert({
          where: { parentId_studentId: { parentId: existing.id, studentId: child!.id } },
          create: { parentId: existing.id, studentId: child!.id }, update: {},
        });
        const { isPlatformAdmin, ...safe } = existing;
        return { ...safe, accountReused: true };
      }
      // Old accounts can contain mixed-case emails. Prisma's ordinary unique
      // index only covers exact spelling; match the same identity used by login.
      if (email && await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true },
      })) throw new ApiError('邮箱已被其他账号使用', 409, 'IDENTITY_EXISTS');
      const created = await tx.user.create({
        data: { email, name, phone, password: hash,
          role: role === 'manager' ? (employeeRoles.includes(body.jobRole) ? body.jobRole : 'staff') : role,
          managementLevel: role === 'manager' ? 'super' : 'none',
          managementGrantedById: role === 'manager' ? actor.id : null,
          managementGrantedAt: role === 'manager' ? new Date() : null,
          organizationId: org, campusId: campus },
        select: userFields,
      });
      if (role === 'manager') await tx.userManagementEvent.create({ data: { organizationId: org, actorId: actor.id,
        userId: created.id, fromLevel: 'none', toLevel: 'super', jobRole: jobRole(created), origin: 'platform-creation' } });
      if (child) await tx.parentStudentLink.create({ data: { studentId: child.id, parentId: created.id } });
      return { ...created, defaultPassword: password, accountReused: false };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') fail('手机号或邮箱已被其他账号使用', 409);
    throw e;
  }
}
