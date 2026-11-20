import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import { assertCanEndEnrollment, assertEnrollmentCapacity, lockEnrollmentClass, lockEnrollmentStudent } from './enrollmentPeriod';

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function transferRequest(body: Record<string, unknown>) {
  const { studentId, toClassId, fromClassId, fromEnrollmentId, fromEnrollmentIds, notes } = body;
  if (!isId(studentId) || !isId(toClassId)) throw new ApiError('请选择学员和目标班级', 400, 'INVALID_TRANSFER');
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) throw new ApiError('备注不能超过 2000 字', 400);
  const batch = fromEnrollmentIds !== undefined;
  let ids: string[];
  if (batch) {
    if (fromClassId !== undefined || fromEnrollmentId !== undefined || !Array.isArray(fromEnrollmentIds) || !fromEnrollmentIds.length ||
        !fromEnrollmentIds.every(isId) || new Set(fromEnrollmentIds).size !== fromEnrollmentIds.length) {
      throw new ApiError('请选择至少一条原报名，每条报名只选一次', 400, 'INVALID_TRANSFER_SOURCES');
    }
    ids = [...fromEnrollmentIds].sort();
  } else {
    if (!isId(fromEnrollmentId) || !isId(fromClassId)) throw new ApiError('请选择原报名和原班级', 400, 'INVALID_TRANSFER_SOURCES');
    ids = [fromEnrollmentId];
  }
  return { studentId, toClassId, ids, legacyClassId: batch ? undefined : fromClassId, batch, notes: notes?.trim() };
}

export async function transferEnrollments(tx: Prisma.TransactionClient, request: ReturnType<typeof transferRequest>, actor: {
  id: string; organizationId: string; campusId: string;
}) {
  const scope = { organizationId: actor.organizationId, campusId: actor.campusId };
  const { studentId, toClassId, ids } = request;
  const student = await lockEnrollmentStudent(tx, studentId, scope);
  const sources = await tx.enrollment.findMany({
    where: { id: { in: ids }, studentId, organizationId: scope.organizationId, class: scope },
    orderBy: { id: 'asc' },
  });
  if (sources.length !== ids.length || (request.legacyClassId && sources[0].classId !== request.legacyClassId)) {
    throw new ApiError('原报名不存在或不属于当前学员和校区，请刷新后核对', 404, 'ENROLLMENT_NOT_FOUND');
  }
  if (sources.some(source => source.classId === toClassId)) throw new ApiError('目标班级不能选为原班级', 400, 'INVALID_TRANSFER_DESTINATION');

  // Transfers for different students may cross the same classes in opposite directions.
  // Use one lock order for both the membership scope and the destination capacity check.
  const classIds = [...new Set([toClassId, ...sources.map(source => source.classId)])].sort();
  const classes = [];
  for (const id of classIds) classes.push(await lockEnrollmentClass(tx, id, scope));
  const destination = classes.find(cls => cls.id === toClassId)!;

  const keys = ids.map(id => 'transfer:' + id);
  const receipts = await tx.lessonTransfer.findMany({ where: { id: { in: keys } }, orderBy: { id: 'asc' } });
  if (receipts.length) {
    const byKey = new Map(receipts.map(receipt => [receipt.id, receipt]));
    if (receipts.length !== ids.length || !sources.every(source => {
      const receipt = byKey.get('transfer:' + source.id);
      return receipt?.status === 'completed' && receipt.organizationId === scope.organizationId && receipt.studentId === studentId && receipt.fromClassId === source.classId && receipt.toClassId === toClassId;
    })) throw new ApiError('所选原报名已有其他调班记录，请刷新后重新选择', 409, 'TRANSFER_CONFLICT');
    return { transfers: receipts, replayed: true };
  }

  if (student.status !== 'active') throw new ApiError('学员当前不可调班', 409, 'STUDENT_UNAVAILABLE');
  if (destination.status !== 'active') throw new ApiError('目标班级已停用', 409, 'CLASS_UNAVAILABLE');
  const boundary = new Date();
  for (const source of sources) await assertCanEndEnrollment(tx, source, boundary);
  const enrolled = await tx.enrollment.findFirst({ where: { studentId, organizationId: scope.organizationId, classId: toClassId, status: 'active' } });
  if (!enrolled) await assertEnrollmentCapacity(tx, toClassId, destination.capacity);
  const closed = await tx.enrollment.updateMany({
    where: { id: { in: ids }, studentId, organizationId: scope.organizationId, status: 'active', endedAt: null },
    data: { endedAt: boundary, status: 'transferred' },
  });
  if (closed.count !== ids.length) throw new ApiError('原报名已变更，请刷新后重新选择', 409, 'TRANSFER_CONFLICT');
  if (!enrolled) await tx.enrollment.create({ data: { organizationId: scope.organizationId, studentId, classId: toClassId, enrolledBy: actor.id, enrolledAt: boundary } });
  const transfers = [];
  for (const source of sources) {
    transfers.push(await tx.lessonTransfer.create({ data: {
      id: 'transfer:' + source.id, organizationId: scope.organizationId, studentId, fromClassId: source.classId, toClassId,
      transferredLessons: 0, operatedBy: actor.id, createdAt: boundary, notes: request.notes || '仅转班，学员课时及财务余额不变',
    } }));
  }
  return { transfers, replayed: false };
}
