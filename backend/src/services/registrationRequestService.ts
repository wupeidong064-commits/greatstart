import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

export const registrationRoles = ['admin', 'manager', 'coach', 'teacher', 'sales', 'staff'];
export function registrationActor(req: AuthRequest) {
  const user = req.user;
  if (!user?.organizationId || !user.campusId || !registrationRoles.includes(user.role)) {
    throw new ApiError('登记需要当前校区的员工账号', 403, 'FORBIDDEN');
  }
  return { id: user.id, role: user.role, organizationId: user.organizationId, campusId: user.campusId };
}
export type RegistrationActor = ReturnType<typeof registrationActor>;
export const managesRegistrations = (actor: RegistrationActor) => ['admin', 'manager'].includes(actor.role);

export function requestKey(req: AuthRequest) {
  const body = req.body?.requestId;
  const header = req.get('Idempotency-Key');
  if (header === undefined && body === undefined) return undefined;
  const key = z.uuid().safeParse(header ?? body);
  if (!key.success || (header !== undefined && body !== undefined &&
      (typeof body !== 'string' || body.toLowerCase() !== header.toLowerCase()))) {
    throw new ApiError('登记请求编号须为一致的 UUID', 400, 'INVALID_REQUEST_ID');
  }
  return key.data.toLowerCase();
}

export async function runRegistration<T extends { id: string }>(options: {
  actor: RegistrationActor; operation: 'lead' | 'experience' | 'conversion'; key?: string;
  // Callers build a fixed-order, normalized command from the accepted business fields.
  command: object;
  authorizeReplay: (tx: Prisma.TransactionClient, id: string) => Promise<void>;
  create: (tx: Prisma.TransactionClient) => Promise<T>;
}) {
  const { actor, operation, key, command, authorizeReplay, create } = options;
  const { organizationId, campusId, id: actorId } = actor;
  return prisma.$transaction(async tx => {
    if (!key) return { data: await create(tx), status: 'legacy' as const };
    const identity = { organizationId, operation, requestId: key };
    const payloadHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'registration:' + organizationId + ':' + operation}), hashtext(${key}))`;
    const prior = await tx.registrationReceipt.findUnique({ where: { organizationId_operation_requestId: identity } });
    if (prior) {
      if (prior.actorId !== actorId || prior.campusId !== campusId || prior.payloadHash !== payloadHash) {
        throw new ApiError('此请求编号已用于其他登记，请核对原操作', 409, 'IDEMPOTENCY_CONFLICT');
      }
      await authorizeReplay(tx, prior.resultId);
      return { data: prior.snapshot, status: 'replayed' as const };
    }
    const data = await create(tx);
    const snapshot = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonObject;
    await tx.registrationReceipt.create({ data: { ...identity, campusId, actorId, payloadHash, resultId: data.id, snapshot } });
    return { data, status: 'created' as const };
  }, { maxWait: 15000, timeout: 20000 });
}

export function textValue(value: unknown, label: string, required = false): string | null {
  if (value != null && typeof value !== 'string') throw new ApiError(label + '无效', 400, 'INVALID_PARAMS');
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result && required) throw new ApiError('请填写' + label, 400, 'INVALID_PARAMS');
  return result || null;
}

export async function scopedStaff(tx: Prisma.TransactionClient, actor: RegistrationActor, id: string, teacher = false) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
  const roles = teacher ? ['admin', 'manager', 'teacher', 'coach'] : registrationRoles;
  const staff = await tx.user.findFirst({
    where: { id, organizationId: actor.organizationId, campusId: actor.campusId, isActive: true, role: { in: roles } },
    select: { id: true, name: true },
  });
  if (!staff) throw new ApiError(teacher ? '上课老师无效或不属于当前校区' : '负责人无效或不属于当前校区', 403, 'FORBIDDEN');
  return staff;
}

// Unassigned legacy leads use the creator's campus, matching the lead register.
export async function accessibleLead(tx: Prisma.TransactionClient, actor: RegistrationActor, id: string) {
  const tenant = { organizationId: actor.organizationId, campusId: actor.campusId };
  const owners = managesRegistrations(actor)
    ? { OR: [{ assignee: tenant }, { assigneeId: null, createdById: { in: (await tx.user.findMany({
        where: tenant, select: { id: true },
      })).map(row => row.id) } }] }
    : { assigneeId: actor.id };
  const lead = await tx.lead.findFirst({ where: { id, organizationId: tenant.organizationId, ...owners }, select: { id: true } });
  if (!lead) throw new ApiError('线索不存在或不在当前负责范围', 403, 'FORBIDDEN');
}
