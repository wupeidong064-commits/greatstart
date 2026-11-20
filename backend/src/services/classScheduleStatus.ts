import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import { assertScheduleAvailable, CLASS_PAUSED } from './scheduleConflicts';

/** Caller holds the institution timetable lock. Lock occurrences in ID order
 * before changing the class row, matching attendance's occurrence -> class order. */
export async function syncClassScheduleStatus(
  tx: Prisma.TransactionClient,
  cls: { id: string; status: string; organizationId: string; campusId: string | null },
  nextStatus: string,
) {
  const pausing = nextStatus === 'inactive';
  const resuming = cls.status !== 'active' && nextStatus === 'active';
  if (!pausing && !resuming) return;
  const scope = { classId: cls.id, organizationId: cls.organizationId, campusId: cls.campusId };
  const pending = { ...scope, startTime: { gt: new Date() }, status: { in: pausing ? ['scheduled'] : [CLASS_PAUSED, 'scheduled'] } };
  const ids = await tx.schedule.findMany({ where: pending, select: { id: true }, orderBy: { id: 'asc' } });
  for (const { id } of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
  // Read again after acquiring locks. An attendance writer may have completed a lesson.
  const rows = await tx.schedule.findMany({ where: { ...pending, startTime: { gt: new Date() } }, orderBy: { id: 'asc' } });
  if (pausing) {
    for (const row of rows) {
      if (await tx.attendance.count({ where: { scheduleId: row.id } }) ||
          await tx.lessonLog.count({ where: { scheduleId: row.id } }) ||
          await tx.lessonDeductionRecord.count({ where: { scheduleId: row.id } })) continue;
      await tx.schedule.update({ where: { id: row.id }, data: { status: CLASS_PAUSED } });
    }
    return;
  }

  // Make preserved scheduled rows visible to conflict checks inside this transaction.
  // A later conflict rolls back both the class and every previously restored row.
  await tx.class.update({ where: { id: cls.id }, data: { status: 'active' } });
  for (const row of rows) {
    if (row.teacherId && !await tx.user.findFirst({ where: {
      id: row.teacherId, organizationId: cls.organizationId, campusId: cls.campusId,
      isActive: true, role: { in: ['teacher', 'coach', 'admin', 'manager'] },
    } })) throw new ApiError('复课失败，原场次教师已停用或不属于本校区', 409, 'TEACHER_UNAVAILABLE');
    await assertScheduleAvailable(tx, row, { excludeIds: [row.id] });
    if (row.status === CLASS_PAUSED) await tx.schedule.update({ where: { id: row.id }, data: { status: 'scheduled' } });
  }
}
