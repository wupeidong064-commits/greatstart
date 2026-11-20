import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { lockHandover, teachingRoles } from './resourceHandover';
import { lockEnrollmentStudent } from './enrollmentPeriod';
import { dormantResourceWhere } from './studentResponsibility';

type Actor = NonNullable<AuthRequest['user']>;
type Assignment = { kind: 'student'; resourceId: string; toUserId: string };
export type DormantInput = { fromUserId: string; assignments: Assignment[]; notes: string; requestId?: string };
export const UNASSIGNED_RECALL = 'unassigned';
const scopeOf = (actor: Actor) => ({ organizationId: actor.organizationId!, campusId: actor.campusId! });
const ownerOf = (source: string) => source === UNASSIGNED_RECALL ? null : source;

export function dormantInput(body: any, executing = false): DormantInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('交接内容无效', 400, 'INVALID_PARAMS');
  const { fromUserId, assignments, notes = '', requestId } = body;
  if (typeof fromUserId !== 'string' || !fromUserId || !Array.isArray(assignments) || !assignments.length || assignments.length > 1000 ||
      assignments.some(row => !row || row.kind !== 'student' || typeof row.resourceId !== 'string' || !row.resourceId || typeof row.toUserId !== 'string' || !row.toUserId || row.toUserId === fromUserId) ||
      new Set(assignments.map(row => row.resourceId)).size !== assignments.length || typeof notes !== 'string' || notes.length > 2000 ||
      (executing && (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{16,128}$/.test(requestId))))
    throw new ApiError('请选择沉默学员和不同的接手老师，学员不能重复，备注不超过2000字', 400, 'INVALID_PARAMS');
  return { fromUserId, assignments: assignments.map(({ resourceId, toUserId }) => ({ kind: 'student' as const, resourceId, toUserId })).sort((a, b) => a.resourceId.localeCompare(b.resourceId)), notes, ...(executing ? { requestId } : {}) };
}

export async function recallSource(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  if (id === UNASSIGNED_RECALL) return { id, name: '待分配' };
  const source = await tx.user.findFirst({ where: { ...scopeOf(actor), id, isPlatformAdmin: false, role: { in: teachingRoles } }, select: { id: true, name: true } });
  if (!source) throw new ApiError('原回访老师不属于当前机构或校区', 403, 'FORBIDDEN');
  return source;
}

export async function dormantCounts(tx: Prisma.TransactionClient, actor: Actor, source: string) {
  const students = await tx.student.count({ where: { ...dormantResourceWhere(scopeOf(actor)), recallTeacherId: ownerOf(source) } });
  return { leads: 0, experiences: 0, students, total: students };
}

export async function dormantCandidates(tx: Prisma.TransactionClient, actor: Actor) {
  const scope = scopeOf(actor);
  const [users, counts] = await Promise.all([
    tx.user.findMany({ where: { ...scope, isPlatformAdmin: false, role: { in: teachingRoles } }, select: { id: true, name: true, role: true, isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    tx.student.groupBy({ by: ['recallTeacherId'], where: dormantResourceWhere(scope), _count: { _all: true } }),
  ]);
  const countByOwner = new Map(counts.map(row => [row.recallTeacherId, row._count._all]));
  const people = users.map(person => ({ ...person, studentCount: countByOwner.get(person.id) || 0 }));
  const unassignedCount = countByOwner.get(null) || 0;
  return { sources: [...people.filter(person => person.isActive), ...(unassignedCount ? [{ id: UNASSIGNED_RECALL, name: '待分配', role: 'teacher', isActive: true, studentCount: unassignedCount }] : [])],
    recipients: people.filter(person => person.isActive), inactiveSources: people.filter(person => !person.isActive && person.studentCount > 0), unassignedCount };
}

export async function dormantResources(tx: Prisma.TransactionClient, actor: Actor, source: string) {
  await recallSource(tx, actor, source);
  const rows = await tx.student.findMany({ where: { ...dormantResourceWhere(scopeOf(actor)), recallTeacherId: ownerOf(source) },
    select: { id: true, name: true, phone: true, parentPhone: true, status: true, renewalStatus: true, recallTeacher: { select: { id: true, name: true } },
      enrollments: { where: { organizationId: actor.organizationId, class: { ...scopeOf(actor) } }, select: { class: { select: { name: true } } }, orderBy: { enrolledAt: 'desc' } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  return { leads: [], experiences: [], students: rows.map(({ enrollments, ...row }) => ({ ...row, phone: row.phone || row.parentPhone,
    resourceLabel: row.status === 'lost' ? '已移出花名册' : row.renewalStatus === 'no_renewal' ? '不续费' : '已召回待入班',
    ownerName: row.recallTeacher?.name || '待分配', sourceClasses: [...new Set(enrollments.map(enrollment => enrollment.class.name))] })) };
}

export async function planDormantBatch(tx: Prisma.TransactionClient, actor: Actor, input: DormantInput) {
  const scope = scopeOf(actor), from = await recallSource(tx, actor, input.fromUserId);
  const [people, rows] = await Promise.all([
    tx.user.findMany({ where: { ...scope, isActive: true, isPlatformAdmin: false, role: { in: teachingRoles }, id: { in: [...new Set(input.assignments.map(row => row.toUserId))] } }, select: { id: true, name: true } }),
    tx.student.findMany({ where: { ...dormantResourceWhere(scope), recallTeacherId: ownerOf(input.fromUserId), id: { in: input.assignments.map(row => row.resourceId) } }, select: { id: true, name: true, phone: true, parentPhone: true, updatedAt: true } }),
  ]);
  const targets = new Map(people.map(person => [person.id, person])), records = new Map(rows.map(row => [row.id, row]));
  const items = input.assignments.map(assignment => {
    const row = records.get(assignment.resourceId), to = targets.get(assignment.toUserId);
    const reason = !to ? '接手人必须是本机构校区的在职老师' : !row ? '学员已恢复入班、归档或回访归属发生变化，请刷新核对' : undefined;
    return { ...assignment, name: row?.name || '资源已变化', contact: row?.phone || row?.parentPhone || '', toUserName: to?.name || '不可用老师', status: reason ? 'unavailable' as const : 'ready' as const, ...(reason ? { reason } : {}) };
  });
  return { from, records, preview: { items, readyCount: items.filter(row => row.status === 'ready').length, unavailableCount: items.filter(row => row.status !== 'ready').length, remainingCounts: await dormantCounts(tx, actor, input.fromUserId) } };
}

export async function executeDormantBatch(tx: Prisma.TransactionClient, actor: Actor, input: DormantInput) {
  const operator = await lockHandover(tx, actor), scope = scopeOf(actor);
  const payloadHash = createHash('sha256').update(JSON.stringify({ ...scope, fromUserId: input.fromUserId, assignments: input.assignments, notes: input.notes })).digest('hex');
  const prior = await tx.resourceTransfer.findFirst({ where: { organizationId: scope.organizationId, operatedBy: operator.id, transferDetails: { path: ['dormantBatchRequestId'], equals: input.requestId! } }, orderBy: { createdAt: 'asc' } });
  if (prior) {
    const receipt = prior.transferDetails as Prisma.JsonObject;
    if (receipt.dormantBatchPayloadHash !== payloadHash) throw new ApiError('该请求编号已用于不同交接安排，请核对原记录', 409, 'IDEMPOTENCY_CONFLICT');
    if (!receipt.dormantBatchResult) throw new ApiError('请在交接历史核对本次结果', 409, 'RECEIPT_UNAVAILABLE');
    return receipt.dormantBatchResult;
  }
  // Student/enrollment edits use the same advisory -> row locks. Refresh the
  // plan AFTER waiting, so a concurrent recall/enrollment cannot be handed over.
  for (const row of input.assignments) await lockEnrollmentStudent(tx, row.resourceId, scope);
  const plan = await planDormantBatch(tx, actor, input);
  const unavailable = plan.preview.items.find(item => item.status !== 'ready');
  if (unavailable) throw new ApiError(`「${unavailable.name}」暂不能交接：${unavailable.reason}。本批未修改。`, 409, 'RESOURCE_CHANGED');
  for (const item of plan.preview.items) {
    const record = plan.records.get(item.resourceId)!;
    const result = await tx.student.updateMany({ where: { ...dormantResourceWhere(scope), id: item.resourceId, recallTeacherId: ownerOf(input.fromUserId), updatedAt: record.updatedAt }, data: { recallTeacherId: item.toUserId } });
    if (result.count !== 1) throw new ApiError('学员状态或回访归属刚刚变化，本批未修改，请重新检查', 409, 'RESOURCE_CHANGED');
  }
  const transfers = plan.preview.items.map(({ kind, resourceId, toUserId, toUserName }) => ({ kind, resourceId, toUserId, toUserName }));
  const details = { leadCount: 0, experienceCount: 0, studentCount: transfers.length, total: transfers.length };
  const result = { batchId: randomUUID(), details, remainingCounts: await dormantCounts(tx, actor, input.fromUserId), transfers };
  for (const toId of new Set(transfers.map(row => row.toUserId))) {
    const group = transfers.filter(row => row.toUserId === toId);
    await tx.resourceTransfer.create({ data: { organizationId: scope.organizationId, fromTeacherId: input.fromUserId === UNASSIGNED_RECALL ? operator.id : plan.from.id,
      fromTeacherName: plan.from.name, toTeacherId: toId, toTeacherName: group[0].toUserName, operatedBy: operator.id, operatedByName: operator.name,
      notes: input.notes, status: 'completed', transferDetails: { kind: 'dormant', sourceUserId: input.fromUserId, students: group.map(row => row.resourceId), studentCount: group.length,
        batchId: result.batchId, dormantBatchRequestId: input.requestId!, dormantBatchPayloadHash: payloadHash, dormantBatchResult: result } } });
  }
  return result;
}
