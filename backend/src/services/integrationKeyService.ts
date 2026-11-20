import { createHash, randomBytes, randomUUID } from 'crypto';
import type { IntegrationKey, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { sessionTag, type AuthRequest } from '../middleware/auth';
import { lockManagement } from './managementAccess';
import { resolveDefaultCampus } from './organizationScope';

export const hashIntegrationKey = (key: string) => createHash('sha256').update(key).digest('hex');
const denied = () => new ApiError('接入密钥无效或已失效，请联系机构管理员重新生成', 401, 'INVALID_INTEGRATION_KEY');
const issuerStamp = (user: { password: string; managementGrantedAt: Date | null; campusId: string | null }) =>
  createHash('sha256').update(JSON.stringify([sessionTag(user.password), user.managementGrantedAt?.toISOString() ?? null, user.campusId])).digest('hex');
const metadata = (key: IntegrationKey, status = key.revokedAt ? 'revoked' : 'active') => ({
  revision: key.revision, status, keyPrefix: key.keyPrefix, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt,
});

async function issuerScope(db: Prisma.TransactionClient, key: IntegrationKey) {
  const issuer = await db.user.findUnique({ where: { id: key.createdById }, include: { organization: true } });
  if (!issuer?.isActive || issuer.organizationId !== key.organizationId || !issuer.organization?.isActive ||
    !(issuer.isPlatformAdmin || ['super', 'manager'].includes(issuer.managementLevel)) ||
    key.creatorSessionTag !== issuerStamp(issuer)) throw denied();
  const campus = await resolveDefaultCampus(db, key.organizationId);
  if (issuer.campusId !== campus.id) throw denied();
  return { id: issuer.id, email: issuer.email, organizationId: key.organizationId, campusId: campus.id,
    role: 'manager', managementLevel: issuer.managementLevel, isPlatformAdmin: false };
}

export async function integrationKeyStatus(organizationId: string) {
  const key = await prisma.integrationKey.findUnique({ where: { organizationId } });
  if (!key) return { revision: null, status: 'missing', keyPrefix: null, createdAt: null, lastUsedAt: null };
  let status = key.revokedAt ? 'revoked' : 'active';
  if (status === 'active') {
    try { await issuerScope(prisma, key); }
    catch (e) { if (!(e instanceof ApiError)) throw e; status = 'unavailable'; }
  }
  return metadata(key, status);
}

export async function changeIntegrationKey(actor: NonNullable<AuthRequest['user']>, expectedRevision: string | null, revoke = false) {
  if (!actor.organizationId) throw new ApiError('未分配机构', 403, 'FORBIDDEN');
  const organizationId = actor.organizationId;
  return prisma.$transaction(async tx => {
    await lockManagement(tx, organizationId);
    const current = await tx.user.findUnique({ where: { id: actor.id } });
    if (!current?.isActive || current.organizationId !== organizationId ||
      !(current.isPlatformAdmin || ['super', 'manager'].includes(current.managementLevel)))
      throw new ApiError('只有本机构管理员可以管理接入密钥', 403, 'FORBIDDEN');
    const campus = await resolveDefaultCampus(tx, organizationId);
    if (current.campusId !== campus.id) throw new ApiError('账号机构范围异常', 403, 'FORBIDDEN');
    const previous = await tx.integrationKey.findUnique({ where: { organizationId } });
    if ((previous?.revision ?? null) !== expectedRevision)
      throw new ApiError('接入配置已变化，请刷新后再操作', 409, 'INTEGRATION_KEY_CONFLICT');
    if (revoke) {
      if (!previous) return { revision: null, status: 'missing', keyPrefix: null, createdAt: null, lastUsedAt: null };
      if (previous.revokedAt) return metadata(previous);
      return metadata(await tx.integrationKey.update({ where: { id: previous.id }, data: { revokedAt: new Date(), revision: randomUUID() } }));
    }
    const plaintext = 'bzsk_' + randomBytes(32).toString('hex');
    const data = { keyHash: hashIntegrationKey(plaintext), keyPrefix: plaintext.slice(0, 13), revision: randomUUID(),
      createdById: current.id, creatorSessionTag: issuerStamp(current), createdAt: new Date(), revokedAt: null, lastUsedAt: null };
    const saved = await tx.integrationKey.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
    return { ...metadata(saved), plaintext };
  });
}

export async function authenticateIntegrationKey(plaintext: string) {
  if (!/^bzsk_[a-f0-9]{64}$/.test(plaintext)) throw denied();
  const key = await prisma.integrationKey.findUnique({ where: { keyHash: hashIntegrationKey(plaintext) } });
  if (!key || key.revokedAt) throw denied();
  const user = await issuerScope(prisma, key);
  // CAS prevents a concurrently rotated/revoked credential being accepted after scope validation.
  const used = await prisma.integrationKey.updateMany({ where: { id: key.id, revision: key.revision, revokedAt: null }, data: { lastUsedAt: new Date() } });
  if (used.count !== 1) throw denied();
  return user;
}
