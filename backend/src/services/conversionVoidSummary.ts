import { Prisma } from '@prisma/client';

type Actor = { id: string; role?: string; organizationId?: string; campusId?: string };
type Filters = { studentId?: string; salesId?: string; startDate?: string; endDate?: string; unlinkedOnly?: boolean; newOnly?: boolean };

// Keep the same campus/owner policy as conversionQuery, including archived
// students and classless orders. Current student status is not a history filter.
function orderScope(actor: Actor, filters: Filters) {
  const predicates = [Prisma.sql`c."organizationId" = ${actor.organizationId}`,
    Prisma.sql`c."approvalStatus" = 'voided'`, Prisma.sql`(
      EXISTS (SELECT 1 FROM classes cl WHERE cl.id = c."classId" AND cl."organizationId" = ${actor.organizationId} AND cl."campusId" = ${actor.campusId})
      OR (c."classId" IS NULL AND EXISTS (SELECT 1 FROM students s WHERE s.id = c."studentId" AND s."organizationId" = ${actor.organizationId} AND s."campusId" = ${actor.campusId}))
      OR (c."classId" IS NULL AND c."studentId" IS NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = c."salesId" AND u."organizationId" = ${actor.organizationId} AND u."campusId" = ${actor.campusId}))
    )`];
  if (!['admin', 'manager'].includes(actor.role || '')) predicates.push(Prisma.sql`c."salesId" = ${actor.id}`);
  if (filters.studentId) predicates.push(Prisma.sql`c."studentId" = ${filters.studentId}`);
  if (filters.salesId) predicates.push(Prisma.sql`c."salesId" = ${filters.salesId}`);
  if (filters.startDate) predicates.push(Prisma.sql`c."conversionDate" >= ${filters.startDate}`);
  if (filters.endDate) predicates.push(Prisma.sql`c."conversionDate" <= ${filters.endDate}`);
  if (filters.newOnly) predicates.push(Prisma.sql`(c."courseType" IS NULL OR c."courseType" NOT IN ('renewal', '续费', '续报'))`);
  if (filters.unlinkedOnly) predicates.push(Prisma.sql`FALSE`);
  return Prisma.join(predicates, ' AND ');
}

export async function conversionVoidSummary(tx: Prisma.TransactionClient, actor: Actor, filters: Filters) {
  // Match legacy references across ALL orders before applying owner filters: an
  // eight-character prefix shared by two orders must never be guessed or counted twice.
  const [row] = await tx.$queryRaw<Array<{ reversedLessons: string; unresolvedLogs: string }>>(Prisma.sql`
    WITH mapped AS (
      SELECT l.id, MIN(c.id) AS order_id, MAX(l.lessons) AS lessons
      FROM lesson_logs l
      LEFT JOIN lesson_logs credit ON credit.id = l."reversalOfId"
        AND credit."organizationId" = l."organizationId" AND credit."studentId" = l."studentId" AND credit.type = 'add'
      JOIN conversions c ON c."organizationId" = l."organizationId" AND c."studentId" = l."studentId"
        AND c."approvalStatus" = 'voided' AND CASE
          WHEN l."conversionId" IS NOT NULL THEN c.id = l."conversionId"
          WHEN credit."conversionId" IS NOT NULL THEN c.id = credit."conversionId"
          WHEN credit.notes ~ '^(新签|续费)入账：[0-9a-fA-F-]{36}$'
            THEN credit.notes IN ('新签入账：' || c.id, '续费入账：' || c.id)
          WHEN l.notes ~ '^成单作废冲回 [0-9a-fA-F-]{36}：'
            THEN l.notes LIKE ('成单作废冲回 ' || c.id || '：%')
          ELSE l.notes LIKE ('成单作废冲回 ' || LEFT(c.id, 8) || '：%')
        END
      WHERE l."organizationId" = ${actor.organizationId} AND l.type = 'void'
      GROUP BY l.id HAVING COUNT(DISTINCT c.id) = 1
    )
    SELECT
      COALESCE((SELECT SUM(m.lessons) FROM mapped m JOIN conversions c ON c.id = m.order_id WHERE ${orderScope(actor, filters)}), 0)::text AS "reversedLessons",
      (SELECT COUNT(*) FROM lesson_logs l WHERE l."organizationId" = ${actor.organizationId} AND l.type = 'void'
        AND NOT EXISTS (SELECT 1 FROM mapped m WHERE m.id = l.id)
        AND EXISTS (SELECT 1 FROM conversions c WHERE c."studentId" = l."studentId" AND ${orderScope(actor, filters)})
      )::text AS "unresolvedLogs"
  `);
  return { reversedLessons: Number(row.reversedLessons), unresolvedLogs: Number(row.unresolvedLogs) };
}
