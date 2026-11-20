import { Prisma } from '@prisma/client';
import { readLessonLedgers } from './lessonLedger';
import { businessDate } from './scheduleAttendanceService';

type Scope = { organizationId: string; campusId: string };
type Money = { cents: number; unpricedLessons: number };

export function consumptionMoney(value: Money) {
  const complete = value.unpricedLessons === 0;
  return {
    // Reporting treats unpriced historical consumption as zero. Keep the raw
    // evidence flags for ledger/refund reconciliation without rewriting data.
    actualConsumptionAmount: value.cents / 100,
    knownConsumptionAmount: value.cents / 100,
    unpricedConsumptionLessons: value.unpricedLessons,
    monetaryHistoryComplete: complete,
  };
}

/** Read only. A correction belongs to the original debit's course/activity date,
 * and returns precisely its recorded allocation instead of using today's price. */
export async function readConsumptionValuation(
  tx: Prisma.TransactionClient,
  scope: Scope,
  scheduleIds: string[],
  activityPeriod?: { start: Date; end: Date }
) {
  const choices: Prisma.LessonLogWhereInput[] = [];
  if (scheduleIds.length) choices.push({ scheduleId: { in: scheduleIds } });
  if (activityPeriod)
    choices.push({
      scheduleId: null,
      OR: [
        {
          businessDate: {
            gte: businessDate(activityPeriod.start),
            lte: businessDate(activityPeriod.end),
          },
        },
        { businessDate: null, createdAt: { gte: activityPeriod.start, lte: activityPeriod.end } },
      ],
    });
  const total: Money = { cents: 0, unpricedLessons: 0 };
  const bySchedule = new Map<string, Money>();
  if (!choices.length) return { ...consumptionMoney(total), bySchedule };
  const debits = await tx.lessonLog.findMany({
    where: { organizationId: scope.organizationId, student: scope, type: 'deduct', OR: choices },
    select: { id: true, studentId: true, scheduleId: true, lessons: true },
  });
  if (!debits.length) return { ...consumptionMoney(total), bySchedule };
  const reversals = await tx.lessonLog.findMany({
    where: {
      organizationId: scope.organizationId,
      student: scope,
      type: 'add',
      reversalOfId: { in: debits.map((log) => log.id) },
    },
    select: { id: true, studentId: true, scheduleId: true, reversalOfId: true, lessons: true },
  });
  const students = await tx.student.findMany({
    where: { ...scope, id: { in: [...new Set(debits.map((log) => log.studentId))] } },
    select: { id: true, remainingLessons: true },
  });
  const ledgers = await readLessonLedgers(tx, students, scope.organizationId);
  const accumulate = (log: (typeof debits)[number], sign: 1 | -1, scheduleId: string | null) => {
    const valuation = ledgers.get(log.studentId)?.valuations.get(log.id);
    // Unpriced portions contribute zero to reports; paid allocations retain their value.
    const cents = sign * (valuation?.amountCents ?? 0);
    const unpriced = sign * (valuation?.unpricedLessons ?? log.lessons);
    total.cents += cents;
    total.unpricedLessons += unpriced;
    if (scheduleId) {
      const own = bySchedule.get(scheduleId) ?? { cents: 0, unpricedLessons: 0 };
      own.cents += cents;
      own.unpricedLessons += unpriced;
      bySchedule.set(scheduleId, own);
    }
  };
  for (const debit of debits) {
    const ledger = ledgers.get(debit.studentId);
    const original = ledger?.valuations.get(debit.id);
    // A foreign-student/schedule reference cannot erase this debit's value.
    const returns = reversals.filter(
      (log) =>
        log.reversalOfId === debit.id &&
        log.studentId === debit.studentId &&
        log.scheduleId === debit.scheduleId
    );
    const ambiguous =
      ledger?.ambiguousDebits.has(debit.id) ||
      returns.length > 1 ||
      returns.some((log) => {
        const restored = ledger?.valuations.get(log.id);
        return (
          log.lessons !== debit.lessons ||
          !original ||
          !restored ||
          original.lessonSource !== restored.lessonSource ||
          original.amountCents !== restored.amountCents ||
          original.unpricedLessons !== restored.unpricedLessons ||
          JSON.stringify(original.allocations) !== JSON.stringify(restored.allocations)
        );
      });
    if (ambiguous) {
      // Conflicting evidence cannot turn a 100-yuan debit into a complete -400-yuan total.
      total.unpricedLessons += debit.lessons;
      if (debit.scheduleId) {
        const own = bySchedule.get(debit.scheduleId) ?? { cents: 0, unpricedLessons: 0 };
        own.unpricedLessons += debit.lessons;
        bySchedule.set(debit.scheduleId, own);
      }
      continue;
    }
    accumulate(debit, 1, debit.scheduleId);
    for (const reversal of returns) accumulate(reversal, -1, debit.scheduleId);
  }
  return { ...consumptionMoney(total), bySchedule };
}
