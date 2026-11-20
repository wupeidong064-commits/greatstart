import { CLASS_PAUSED } from './scheduleConflicts';
import { Prisma } from '@prisma/client';

// Caller holds the institution timetable lock. Lock occurrences before touching the class row.
export async function cancelPendingOccurrences(
  tx: Prisma.TransactionClient, scope: { organizationId: string; campusId: string },
  classId: string, startTime: Prisma.DateTimeFilter,
) {
  const rows = await tx.schedule.findMany({
    where: { ...scope, classId, status: { in: ['scheduled', CLASS_PAUSED] }, startTime },
    orderBy: { id: 'asc' }, select: { id: true, status: true },
  });
  let cancelledCount = 0;
  for (const { id, status } of rows) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    if (await tx.attendance.count({ where: { scheduleId: id } }) ||
        await tx.lessonLog.count({ where: { scheduleId: id } }) ||
        await tx.lessonDeductionRecord.count({ where: { scheduleId: id } })) continue;
    const result = await tx.schedule.updateMany({ where: { id, status }, data: { status: 'cancelled' } });
    cancelledCount += result.count;
  }
  return cancelledCount;
}
