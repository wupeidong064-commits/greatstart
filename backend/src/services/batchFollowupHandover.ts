import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { experienceScopeWhere } from '../utils/experienceScope';
import { lockHandover } from './resourceHandover';

type Actor = NonNullable<AuthRequest['user']>;
export type FollowupKind = 'lead' | 'experience';
export type FollowupAssignment = { kind: FollowupKind; resourceId: string; toUserId: string };
export type FollowupBatchInput = { fromUserId: string; assignments: FollowupAssignment[]; notes: string; requestId?: string };
// Registration takes experience -> lead -> student locks. Keep writes in the
// same order, without introducing a resource -> user-row lock inversion.
const kindOrder: Record<FollowupKind, number> = { experience: 0, lead: 1 };
const keyOf = (row: Pick<FollowupAssignment, 'kind' | 'resourceId'>) => `${row.kind}:${row.resourceId}`;

export function followupBatchInput(body: any, executing = false): FollowupBatchInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('交接内容无效', 400, 'INVALID_PARAMS');
  const { fromUserId, assignments, notes = '', requestId } = body;
  if (typeof fromUserId !== 'string' || !fromUserId || !Array.isArray(assignments) || !assignments.length || assignments.length > 1000 ||
      assignments.some(row => !row || !Object.prototype.hasOwnProperty.call(kindOrder, row.kind) || typeof row.resourceId !== 'string' || !row.resourceId || typeof row.toUserId !== 'string' || !row.toUserId || row.toUserId === fromUserId) ||
      new Set(assignments.map(keyOf)).size !== assignments.length || typeof notes !== 'string' || notes.length > 2000 ||
      (executing && (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{16,128}$/.test(requestId))))
    throw new ApiError('请为至少一条资源选择有效的接手人员；资源不能重复，接手人不能是原负责人，备注不超过2000字', 400, 'INVALID_PARAMS');
  const normalized: FollowupAssignment[] = assignments.map(({ kind, resourceId, toUserId }) => ({ kind, resourceId, toUserId }));
  return { fromUserId, assignments: normalized.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.resourceId.localeCompare(b.resourceId)), notes, ...(executing ? { requestId } : {}) };
}

export async function remainingFollowupCounts(tx: Prisma.TransactionClient, actor: Actor, fromUserId: string) {
  const [leads, experiences] = await Promise.all([
    tx.lead.count({ where: { organizationId: actor.organizationId!, assigneeId: fromUserId, status: { notIn: ['converted', 'lost'] } } }),
    tx.experienceLesson.count({ where: { ...experienceScopeWhere(actor.organizationId, actor.campusId), assigneeId: fromUserId, status: { notIn: ['converted', 'cancelled'] } } }),
  ]);
  return { leads, experiences, students: 0, total: leads + experiences };
}

export async function planFollowupBatch(tx: Prisma.TransactionClient, actor: Actor, input: FollowupBatchInput) {
  const scope = { organizationId: actor.organizationId!, campusId: actor.campusId!, isPlatformAdmin: false, role: { not: 'parent' } };
  const from = await tx.user.findFirst({ where: { ...scope, id: input.fromUserId }, select: { id: true, name: true } });
  if (!from) throw new ApiError('待交接人员不属于当前机构或校区', 403, 'FORBIDDEN');
  const recipients = await tx.user.findMany({ where: { ...scope, isActive: true, id: { in: [...new Set(input.assignments.map(row => row.toUserId))] } }, select: { id: true, name: true } });
  const people = new Map(recipients.map(person => [person.id, person]));
  const byKind = (kind: FollowupKind) => input.assignments.filter(row => row.kind === kind).map(row => row.resourceId);
  // Read only records owned by the chosen source AND within this tenant scope.
  // Guessed IDs from another account/campus never expose their name or phone.
  const [leads, experiences] = await Promise.all([
    tx.lead.findMany({ where: { organizationId: actor.organizationId!, assigneeId: from.id, id: { in: byKind('lead') } }, select: { id: true, customerName: true, contact: true, status: true, updatedAt: true } }),
    tx.experienceLesson.findMany({ where: { ...experienceScopeWhere(actor.organizationId, actor.campusId), assigneeId: from.id, id: { in: byKind('experience') } }, select: { id: true, studentName: true, contact: true, status: true, updatedAt: true } }),
  ]);
  const records = new Map<string, { name: string; contact: string; status: string; eligible: boolean; updatedAt: Date }>();
  for (const row of leads) records.set(`lead:${row.id}`, { name: row.customerName, contact: row.contact, status: row.status, eligible: !['converted', 'lost'].includes(row.status), updatedAt: row.updatedAt });
  for (const row of experiences) records.set(`experience:${row.id}`, { name: row.studentName, contact: row.contact, status: row.status, eligible: !['converted', 'cancelled'].includes(row.status), updatedAt: row.updatedAt });
  const items = input.assignments.map(assignment => {
    const row = records.get(keyOf(assignment)), to = people.get(assignment.toUserId);
    const reason = !to ? '接手人员已停用或不属于本机构校区，请重新选择' : !row ? '资源归属已变化，或不在当前机构校区，请刷新核对' : !row.eligible ? '资源已成单、结束或归档，不再属于待跟进范围' : undefined;
    return { ...assignment, name: row?.name || '资源已变化', contact: row?.contact || '', toUserName: to?.name || '不可用人员', status: reason ? 'unavailable' as const : 'ready' as const, ...(reason ? { reason } : {}) };
  });
  return { from, records, preview: { items, readyCount: items.filter(row => row.status === 'ready').length, unavailableCount: items.filter(row => row.status === 'unavailable').length, remainingCounts: await remainingFollowupCounts(tx, actor, from.id) } };
}

export async function executeFollowupBatch(tx: Prisma.TransactionClient, actor: Actor, input: FollowupBatchInput) {
  const operator = await lockHandover(tx, actor);
  const payloadHash = createHash('sha256').update(JSON.stringify({ campusId: actor.campusId, fromUserId: input.fromUserId, assignments: input.assignments, notes: input.notes })).digest('hex');
  // Separate receipt namespace from class handovers, while sharing their
  // organization lock and durable history, with no new schema or paid service.
  const prior = await tx.resourceTransfer.findFirst({ where: { organizationId: actor.organizationId!, operatedBy: operator.id, transferDetails: { path: ['followupBatchRequestId'], equals: input.requestId! } }, orderBy: { createdAt: 'asc' } });
  if (prior) {
    const receipt = prior.transferDetails as Prisma.JsonObject;
    if (receipt.followupBatchPayloadHash !== payloadHash) throw new ApiError('该请求编号已用于另一份交接安排，请重新检查后再提交', 409, 'IDEMPOTENCY_CONFLICT');
    if (!receipt.followupBatchResult) throw new ApiError('请先在交接历史中核对本次结果', 409, 'RECEIPT_UNAVAILABLE');
    return receipt.followupBatchResult;
  }
  const plan = await planFollowupBatch(tx, actor, input);
  const unavailable = plan.preview.items.find(row => row.status === 'unavailable');
  if (unavailable) throw new ApiError(`「${unavailable.name}」暂不能交接：${unavailable.reason}。本批未作任何修改，请重新检查安排。`, 409, 'RESOURCE_CHANGED');
  for (const item of plan.preview.items) {
    const row = plan.records.get(keyOf(item))!;
    let count = 0;
    if (item.kind === 'experience') count = (await tx.experienceLesson.updateMany({ where: { ...experienceScopeWhere(actor.organizationId, actor.campusId), id: item.resourceId, assigneeId: input.fromUserId, status: { notIn: ['converted', 'cancelled'] }, updatedAt: row.updatedAt }, data: { assigneeId: item.toUserId, assigneeName: item.toUserName } })).count;
    else count = (await tx.lead.updateMany({ where: { organizationId: actor.organizationId!, id: item.resourceId, assigneeId: input.fromUserId, status: { notIn: ['converted', 'lost'] }, updatedAt: row.updatedAt }, data: { assigneeId: item.toUserId, assigneeName: item.toUserName } })).count;
    // A worker may have edited/closed a lead after the plan read. CAS failure
    // must roll back earlier rows and all history, never leave a partial batch.
    if (count !== 1) throw new ApiError('跟进资源刚刚被修改或移交，本批未作任何修改，请刷新核对', 409, 'RESOURCE_CHANGED');
  }
  const transfers = plan.preview.items.map(({ kind, resourceId, toUserId, toUserName }) => ({ kind, resourceId, toUserId, toUserName }));
  const details = { leadCount: transfers.filter(row => row.kind === 'lead').length, experienceCount: transfers.filter(row => row.kind === 'experience').length, studentCount: 0, total: transfers.length };
  const result = { batchId: randomUUID(), details, remainingCounts: await remainingFollowupCounts(tx, actor, input.fromUserId), transfers };
  for (const toId of new Set(transfers.map(row => row.toUserId))) {
    const group = transfers.filter(row => row.toUserId === toId);
    const leads = group.filter(row => row.kind === 'lead').map(row => row.resourceId), experiences = group.filter(row => row.kind === 'experience').map(row => row.resourceId);
    await tx.resourceTransfer.create({ data: { organizationId: actor.organizationId!, fromTeacherId: plan.from.id, fromTeacherName: plan.from.name, toTeacherId: toId, toTeacherName: group[0].toUserName, operatedBy: operator.id, operatedByName: operator.name, notes: input.notes, status: 'completed', transferDetails: { kind: 'followup', leads, experiences, students: [], leadCount: leads.length, experienceCount: experiences.length, studentCount: 0, batchId: result.batchId, followupBatchRequestId: input.requestId!, followupBatchPayloadHash: payloadHash, followupBatchResult: result } } });
  }
  return result;
}
