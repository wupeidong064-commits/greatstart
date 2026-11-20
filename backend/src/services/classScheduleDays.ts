import { Prisma } from '@prisma/client';
import prisma from '../config/database';

/** Class names and old generation rules are not evidence of an upcoming lesson. */
export async function withUpcomingScheduleDays<T extends { id: string }>(classes: T[], organizationId: string) {
  if (!classes.length) return classes.map(row => ({ ...row, scheduleWeekDays: [] as number[] }));
  const days = await prisma.$queryRaw<{ classId: string; weekday: number }[]>(Prisma.sql`
    SELECT DISTINCT s."classId",
      EXTRACT(DOW FROM ((s."startTime" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai'))::integer AS weekday
    FROM schedules s
    JOIN classes c ON c.id = s."classId"
      AND c."organizationId" = s."organizationId"
      AND c."campusId" IS NOT DISTINCT FROM s."campusId"
    WHERE s."organizationId" = ${organizationId}
      AND s."classId" IN (${Prisma.join(classes.map(row => row.id))})
      AND c.status NOT IN ('inactive', 'deleted')
      AND s.status = 'scheduled'
      AND s."endTime" >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  `);
  const byClass = new Map<string, number[]>();
  for (const row of days) byClass.set(row.classId, [...(byClass.get(row.classId) || []), row.weekday]);
  return classes.map(row => ({
    ...row,
    scheduleWeekDays: (byClass.get(row.id) || []).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
  }));
}
