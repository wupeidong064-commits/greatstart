import { readStudentLedger } from './lessonLedger';
import { z } from 'zod';
import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';

type Actor = { id: string; role: string; organizationId?: string; campusId?: string };
type LockedStudent = {
  name: string; status: string; remainingLessons: number; consumedLessons: number;
};

const uuid = z.uuid();

export async function deductActivityLessons(actor: Actor, body: unknown, headerKey?: string) {
  const { organizationId, campusId } = actor;
  if (!organizationId || !campusId || !['admin', 'manager'].includes(actor.role)) {
    throw new ApiError('仅已分配机构和校区的管理员或经理可活动划课', 403, 'FORBIDDEN');
  }
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const key = uuid.safeParse(headerKey ?? input.requestId);
  if (!key.success || (headerKey !== undefined && input.requestId !== undefined &&
      (typeof input.requestId !== 'string' || input.requestId.toLowerCase() !== headerKey.toLowerCase()))) {
    throw new ApiError('每笔活动划课需携带有效且一致的 UUID requestId，重试请沿用原值', 400, 'INVALID_REQUEST_ID');
  }
  const requestId = key.data.toLowerCase();
  const { studentId, lessons } = input;
  const lessonSource = input.lessonSource === undefined ? 'paid' : input.lessonSource;
  if (lessonSource !== 'gift' && lessonSource !== 'paid') throw new ApiError('课时来源无效',400,'INVALID_LESSON_SOURCE');
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (typeof studentId !== 'string' || !studentId.trim() || typeof lessons !== 'number' ||
      !Number.isSafeInteger(lessons) || lessons <= 0 || lessons > 2147483647 || !notes || notes.length > 200) {
    throw new ApiError('请填写学员、正整数课时与活动说明（必填，≤200字）', 400, 'INVALID_PARAMS');
  }

  return prisma.$transaction(async tx => {
    // Lock the request first, even when concurrent callers name different students.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${requestId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;
    const [student] = await tx.$queryRaw<LockedStudent[]>`
      SELECT name, status, "remainingLessons", "consumedLessons" FROM students
      WHERE id = ${studentId} AND "organizationId" = ${organizationId} AND "campusId" = ${campusId}
      FOR UPDATE`;
    if (!student) throw new ApiError('学员不属于当前校区', 403, 'FORBIDDEN');
    if (student.status === 'archived') throw new ApiError('学员已归档，请先恢复', 409, 'STUDENT_ARCHIVED');

    const prior = await tx.activityDeductReceipt.findUnique({
      where: { organizationId_requestId: { organizationId, requestId } },
    });
    if (prior) {
      if (prior.campusId !== campusId || prior.actorId !== actor.id || prior.studentId !== studentId ||
          prior.lessonSource !== lessonSource || prior.lessons !== lessons || prior.notes !== notes) {
        throw new ApiError('该 requestId 已用于另一笔活动划课，请核对原操作', 409, 'IDEMPOTENCY_CONFLICT');
      }
      return prior.response;
    }
    if (student.remainingLessons < lessons) {
      throw new ApiError(`${student.name}课时不足（剩 ${student.remainingLessons} 节）`, 409, 'INSUFFICIENT_LESSONS');
    }
    if (student.consumedLessons + lessons > 2147483647) {
      throw new ApiError('累计消耗课时超出允许范围', 409, 'LESSON_LIMIT_EXCEEDED');
    }
    const ledger = await readStudentLedger(tx,{id:studentId,remainingLessons:student.remainingLessons},organizationId);
    const allocations = ledger.take(lessons,lessonSource);
    const updated = await tx.student.update({
      where: { id: studentId },
      data: { remainingLessons: { decrement: lessons }, consumedLessons: { increment: lessons } },
      select: { remainingLessons: true },
    });
    await tx.lessonLog.create({ data: {
      organizationId, studentId, studentName: student.name, type: 'deduct', lessons, lessonSource, allocations,
      notes: `活动划课：${notes}`, operatorId: actor.id,
    } });
    const receipt = await tx.activityDeductReceipt.create({
      data: { organizationId, requestId, campusId, actorId: actor.id, studentId, lessons, notes, lessonSource,
        response: { success: true, data: {...updated,...ledger.balance,lessonSource}, message: `活动划课成功，当前剩余 ${updated.remainingLessons} 节` } },
      select: { response: true },
    });
    return receipt.response;
  }, { timeout: 20000 });
}
