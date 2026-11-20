import type { Prisma } from '@prisma/client';

/**
 * Attendance follow-up includes marked occurrences (even if marked early) and
 * elapsed, still-scheduled occurrences. An absent mark is not materialized:
 * missing marks are derived from the effective roster, so later make-up marks
 * replace the absence without leaving a second attendance/lesson transaction.
 * Cancelled, rescheduled-away and class-paused occurrences never qualify.
 */
export function followupOccurrenceWhere(now = new Date()): Prisma.ScheduleWhereInput {
  return {
    OR: [
      { status: 'completed' },
      { status: 'scheduled', endTime: { lte: now } },
    ],
  };
}
