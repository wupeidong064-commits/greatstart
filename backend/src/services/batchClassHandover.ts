import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { applyHandover, lockHandover, planHandover } from './resourceHandover';
import { syncClassScheduleStatus } from './classScheduleStatus';
import { lockHandoverRecallStudents, syncHandoverRecallTeachers } from './studentResponsibility';

type Actor = NonNullable<AuthRequest['user']>;
export type ClassAssignment = { classId: string; toTeacherId: string };
export type BatchHandoverInput = { fromTeacherId: string; assignments: ClassAssignment[]; notes: string; requestId?: string };
type Plan = Awaited<ReturnType<typeof planHandover>>;

export function batchHandoverInput(body: any, executing = false): BatchHandoverInput {
  const { fromTeacherId, assignments, notes = '', requestId } = body;
  if (typeof fromTeacherId !== 'string' || !fromTeacherId || !Array.isArray(assignments) || !assignments.length || assignments.length > 1000 ||
      assignments.some(row => !row || typeof row.classId !== 'string' || !row.classId || typeof row.toTeacherId !== 'string' || !row.toTeacherId || row.toTeacherId === fromTeacherId) ||
      new Set(assignments.map(row => row.classId)).size !== assignments.length || typeof notes !== 'string' || notes.length > 2000 ||
      (executing && (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{16,128}$/.test(requestId))))
    throw new ApiError('请为待交接班级选择有效且不同于原老师的接手人，班级不能重复，备注不超过2000字', 400, 'INVALID_PARAMS');
  // Stable payload comparison supports retries even if the client changes row order.
  return { fromTeacherId, assignments: assignments.map(({ classId, toTeacherId }) => ({ classId, toTeacherId })).sort((a, b) => a.classId.localeCompare(b.classId)), notes, ...(executing ? { requestId } : {}) };
}

export async function planBatchHandover(tx: Prisma.TransactionClient, actor: Actor, input: BatchHandoverInput) {
  const plans: Plan[] = [];
  const now = new Date();
  for (const assignment of input.assignments) {
    plans.push(await planHandover(tx, actor, { fromTeacherId: input.fromTeacherId, toTeacherId: assignment.toTeacherId, classIds: [assignment.classId] }, now));
  }
  // Plans are built before any write, so also compare proposed assignments with
  // each other. Both rows must be marked when the same recipient would overlap.
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const a = plans[i], b = plans[j];
      if (a.to.id !== b.to.id) continue;
      for (const x of a.pending) for (const y of b.pending) {
        if (x.status !== 'scheduled' || y.status !== 'scheduled' || x.class.status === 'inactive' || y.class.status === 'inactive') continue;
        if (x.startTime < y.endTime && x.endTime > y.startTime) {
          a.conflicts.push({ className: x.class.name, startTime: x.startTime, endTime: x.endTime, conflictingClassName: y.class.name, conflictingStartTime: y.startTime, conflictingEndTime: y.endTime });
          b.conflicts.push({ className: y.class.name, startTime: y.startTime, endTime: y.endTime, conflictingClassName: x.class.name, conflictingStartTime: x.startTime, conflictingEndTime: x.endTime });
        }
      }
    }
  }
  const items = plans.map(plan => ({
    classId: plan.classes[0].id, className: plan.classes[0].name,
    toTeacherId: plan.to.id, toTeacherName: plan.to.name,
    status: plan.conflicts.length ? 'conflict' as const : 'ready' as const,
    conflicts: plan.conflicts.map(conflict => ({ classId: plan.classes[0].id, ...conflict })),
    details: plan.details,
  }));
  const remainingClassCount = await tx.class.count({ where: { organizationId: actor.organizationId, campusId: actor.campusId, teacherId: input.fromTeacherId, status: { not: 'deleted' } } });
  return { plans, preview: { items, readyCount: items.filter(row => row.status === 'ready').length, conflictCount: items.filter(row => row.status === 'conflict').length, remainingClassCount } };
}

export async function executeBatchHandover(tx: Prisma.TransactionClient, actor: Actor, input: BatchHandoverInput) {
  const operator = await lockHandover(tx, actor);
  const payloadHash = createHash('sha256').update(JSON.stringify({ campusId: actor.campusId, fromTeacherId: input.fromTeacherId, assignments: input.assignments, notes: input.notes })).digest('hex');
  // The management lock serializes the receipt lookup and all logs/writes. Reuse
  // the durable business log instead of adding a separate migration/receipt table.
  const previous = await tx.resourceTransfer.findFirst({ where: { organizationId: actor.organizationId!, operatedBy: operator.id, transferDetails: { path: ['batchRequestId'], equals: input.requestId! } }, orderBy: { createdAt: 'asc' } });
  if (previous) {
    const receipt = previous.transferDetails as Prisma.JsonObject;
    if (receipt.batchPayloadHash !== payloadHash) throw new ApiError('该次交接请求的内容已改变，请重新检查安排后提交', 409, 'IDEMPOTENCY_CONFLICT');
    if (!receipt.batchResult) throw new ApiError('交接结果需核对，请查看交接历史', 409, 'RECEIPT_UNAVAILABLE');
    return receipt.batchResult;
  }
  const { plans, preview } = await planBatchHandover(tx, actor, input);
  const conflict = preview.items.find(row => row.status === 'conflict');
  if (conflict) throw new ApiError(`交接安排已发生冲突：「${conflict.className}」交给${conflict.toTeacherName}会与「${conflict.conflicts[0].conflictingClassName}」重叠。本批次未作任何修改，请重新检查安排。`, 409, 'SCHEDULE_CONFLICT');
  // Pausing a legacy class may also lock substitute-teacher occurrences that
  // were not in the owner's plan. Acquire those locks before ANY class row is
  // updated, preserving attendance's occurrence -> student -> class order.
  for (const plan of plans) for (const cls of plan.classes) {
    if (cls.status === 'inactive') await syncClassScheduleStatus(tx, cls, 'inactive');
  }
  const scope={organizationId:actor.organizationId!,campusId:actor.campusId!};
  const recallStudents=await lockHandoverRecallStudents(tx,scope,plans.flatMap(plan=>plan.details.classes),input.fromTeacherId);
  for (const plan of plans) await applyHandover(tx, plan, true);
  await syncHandoverRecallTeachers(tx,scope,recallStudents,input.fromTeacherId);
  // Applying all classes holds their row locks. An enrollment that committed
  // while we waited must be counted in the durable receipt, not the old preview.
  const counts = await tx.enrollment.groupBy({ by: ['classId'], where: { organizationId: actor.organizationId, classId: { in: plans.flatMap(plan => plan.details.classes) }, status: 'active' }, _count: { _all: true } });
  const studentsByClass = new Map(counts.map(row => [row.classId, row._count._all]));
  for (const plan of plans) plan.details.studentCount = studentsByClass.get(plan.classes[0].id) || 0;
  const transfers = preview.items.map(row => ({ classId: row.classId, className: row.className, toTeacherId: row.toTeacherId, toTeacherName: row.toTeacherName, scheduleCount: row.details.scheduleCount, studentCount: row.details.studentCount }));
  const remainingClassCount = await tx.class.count({ where: { organizationId: actor.organizationId, campusId: actor.campusId, teacherId: input.fromTeacherId, status: { not: 'deleted' } } });
  const result = { batchId: randomUUID(), details: { classCount: plans.length, scheduleCount: plans.reduce((n, plan) => n + plan.details.scheduleCount, 0), studentCount: plans.reduce((n, plan) => n + plan.details.studentCount, 0) }, remainingClassCount, transfers };
  // One history row per recipient keeps the existing history UI and teacher links.
  for (const toId of new Set(plans.map(plan => plan.to.id))) {
    const group = plans.filter(plan => plan.to.id === toId), first = group[0];
    const details = { kind: 'classes', classes: group.flatMap(plan => plan.details.classes), schedules: group.flatMap(plan => plan.details.schedules), classCount: group.length, scheduleCount: group.reduce((n, plan) => n + plan.details.scheduleCount, 0), studentCount: group.reduce((n, plan) => n + plan.details.studentCount, 0), batchId: result.batchId, batchRequestId: input.requestId!, batchPayloadHash: payloadHash, batchResult: result };
    await tx.resourceTransfer.create({ data: { organizationId: actor.organizationId!, fromTeacherId: first.from.id, fromTeacherName: first.from.name, toTeacherId: toId, toTeacherName: first.to.name, operatedBy: operator.id, operatedByName: operator.name, status: 'completed', notes: input.notes, transferDetails: details } });
  }
  return result;
}
