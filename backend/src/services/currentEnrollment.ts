import type { Prisma } from '@prisma/client';

/** Current class membership, shared by student lists and attendance follow-up.
 * Timetables and temporary attendance never turn an unassigned student into a member.
 */
export function currentEnrollmentWhere(
  scope: { organizationId: string; campusId?: string | null },
  now = new Date(),
): Prisma.EnrollmentWhereInput {
  return {
    organizationId: scope.organizationId,
    status: 'active',
    enrolledAt: { lte: now },
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    class: {
      organizationId: scope.organizationId,
      ...(scope.campusId ? { campusId: scope.campusId } : {}),
      status: 'active',
    },
  };
}
