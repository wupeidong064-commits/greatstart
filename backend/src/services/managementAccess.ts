import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import prisma from '../config/database';
import type { AuthRequest } from '../middleware/auth';

export const managementLevels = ['none', 'manager', 'super'] as const;
export type ManagementLevel = typeof managementLevels[number];
type Identity = { role: string; managementLevel?: string; isPlatformAdmin?: boolean };
export const jobRole = (user: Identity) => ['admin', 'manager', 'super_admin'].includes(user.role) ? null : user.role;
// Existing controllers use role as an effective capability; storage retains the employee's job.
export function effectiveRole(user: Identity) {
  if (user.isPlatformAdmin) return 'admin';
  // Both institution levels have the same business capability. Appointment authority
  // is checked separately, and existing acceptance clients remain compatible.
  if (user.managementLevel === 'super' || user.managementLevel === 'manager') return 'manager';
  return jobRole(user) || 'staff';
}
export const sessionUser = <T extends Identity>(user: T) => ({ ...user, jobRole: jobRole(user), role: effectiveRole(user) });
export const staffUser = <T extends Identity>(user: T) => {
  const { password: _password, ...safe } = user as T & { password?: string };
  return { ...safe, jobRole: jobRole(user), role: jobRole(user) || 'staff' };
};
export const managementError = (message: string, code = 'MANAGEMENT_FORBIDDEN') => new ApiError(message, 403, code);
export function assertEditableAccount(actor: NonNullable<AuthRequest['user']>, target: Identity & { id: string }, disabling = false) {
  if (target.isPlatformAdmin) throw managementError('系统管理员账号不能在机构内修改');
  if (target.managementLevel === 'super' && (disabling || target.id !== actor.id))
    throw managementError('超级机构管理员由系统管理员指定，机构内不能更改、停用或删除该账号', 'SUPER_ADMIN_PROTECTED');
  if (target.managementLevel === 'manager' && actor.managementLevel !== 'super' && (disabling || target.id !== actor.id))
    throw managementError('只有超级机构管理员可以管理其他机构管理员账号');
}
export async function lockManagement(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1735352948, hashtext(${organizationId}))`;
}

export async function changeManagement(actor: NonNullable<AuthRequest['user']>, organizationId: string, userId: string, level: unknown, expectedLevel: unknown) {
  if (typeof level !== 'string' || !managementLevels.includes(level as ManagementLevel) || typeof expectedLevel !== 'string' || !managementLevels.includes(expectedLevel as ManagementLevel))
    throw new ApiError('管理身份或原身份无效，请刷新后重试', 400, 'INVALID_MANAGEMENT_LEVEL');
  return prisma.$transaction(async tx => {
    await lockManagement(tx, organizationId);
    // Revalidate actor inside the same lock; an old token cannot retain revoked authority.
    const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
    if (!currentActor?.isActive) throw managementError('当前账号已停用');
    const platform = currentActor.isPlatformAdmin;
    if (!platform && (currentActor.organizationId !== organizationId || currentActor.managementLevel !== 'super'))
      throw managementError('只有超级机构管理员可以设置或取消本机构管理员');
    const target = await tx.user.findFirst({ where: { id: userId, organizationId, isPlatformAdmin: false } });
    if (!target) throw new ApiError('工作人员不存在或不属于该机构', 404, 'USER_NOT_FOUND');
    if (target.role === 'parent') throw managementError('家长账号不能授予机构管理权限');
    if (!target.isActive && level !== 'none') throw new ApiError('请先启用该工作人员账号', 409, 'USER_INACTIVE');
    if (!platform && (target.managementLevel === 'super' || level === 'super'))
      throw managementError('超级机构管理员仅由系统管理员任免', 'SUPER_ADMIN_PROTECTED');
    if (target.managementLevel !== expectedLevel) throw new ApiError('管理身份已变化，请刷新后重试', 409, 'MANAGEMENT_CONFLICT');
    if (target.managementLevel === level) return staffUser(target);
    // A live institution must retain an appointed super administrator during replacement.
    if (target.managementLevel === 'super' && level !== 'super' &&
      await tx.user.count({ where: { organizationId, isActive: true, isPlatformAdmin: false, managementLevel: 'super', id: { not: userId } } }) === 0)
      throw new ApiError('请先指定一位新的超级机构管理员，再取消当前任命', 409, 'LAST_SUPER_ADMIN');
    const updated = await tx.user.update({ where: { id: target.id }, data: {
      managementLevel: level, managementGrantedById: level === 'none' ? null : actor.id,
      managementGrantedAt: level === 'none' ? null : new Date(),
    } });
    await tx.userManagementEvent.create({ data: { organizationId, actorId: actor.id, userId, fromLevel: target.managementLevel,
      toLevel: level, jobRole: jobRole(target), origin: platform ? 'platform-appointment' : 'super-admin-appointment' } });
    return staffUser(updated);
  });
}
