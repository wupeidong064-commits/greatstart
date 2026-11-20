import type { Prisma } from '@prisma/client';
/** Current class membership, shared by student lists and attendance follow-up.
 * Timetables and temporary attendance never turn an unassigned student into a member.
 */
export declare function currentEnrollmentWhere(scope: {
    organizationId: string;
    campusId?: string | null;
}, now?: Date): Prisma.EnrollmentWhereInput;
//# sourceMappingURL=currentEnrollment.d.ts.map