import type { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
export type ResponsibilityScope = {
    organizationId: string;
    campusId: string;
};
/** Teaching responsibility is not attendance eligibility. Paused classes still
 * have a teacher and renewal obligations, but must not enter attendance stats. */
export declare function responsibilityEnrollmentWhere(scope: ResponsibilityScope, now?: Date, teacherId?: string): Prisma.EnrollmentWhereInput;
export declare function teachingStudentWhere(scope: ResponsibilityScope, teacherId: string, now?: Date): Prisma.StudentWhereInput;
export declare const dormantStudentWhere: () => Prisma.StudentWhereInput;
export declare function dormantResourceWhere(scope: ResponsibilityScope, now?: Date): Prisma.StudentWhereInput;
/** A recalled learner stays visible until a real class takes over. This grants
 * profile follow-up only; never enrollment, attendance or renewal authority. */
export declare function recallStudentWhere(scope: ResponsibilityScope, teacherId: string, now?: Date): Prisma.StudentWhereInput;
export declare function renewalAccess(req: AuthRequest): {
    actor: {
        id: string;
        email: string | null;
        role: string;
        organizationId?: string;
        campusId?: string;
        phone?: string;
        isPlatformAdmin?: boolean;
        managementLevel?: string;
        jobRole?: string | null;
    };
    campus: {
        organizationId: string;
        campusId: string;
    };
    management: boolean;
    teacher: boolean;
    where: Prisma.StudentWhereInput;
};
export declare function uniqueResponsibleTeacher(tx: Prisma.TransactionClient, scope: ResponsibilityScope, studentId: string, actorId?: string): Promise<string | null>;
/** Called after ALL class owners in a batch changed. Multiple final teachers
 * stay unassigned instead of depending on the arbitrary class execution order. */
export declare function lockHandoverRecallStudents(tx: Prisma.TransactionClient, scope: ResponsibilityScope, classIds: string[], formerTeacherId: string): Promise<string[]>;
export declare function syncHandoverRecallTeachers(tx: Prisma.TransactionClient, scope: ResponsibilityScope, studentIds: string[], formerTeacherId: string): Promise<void>;
//# sourceMappingURL=studentResponsibility.d.ts.map