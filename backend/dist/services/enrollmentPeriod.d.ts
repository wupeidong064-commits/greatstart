import type { Enrollment, Prisma } from '@prisma/client';
type CampusScope = {
    organizationId: string;
    campusId: string;
};
export declare function lockEnrollmentStudent(tx: Prisma.TransactionClient, studentId: string, scope: CampusScope): Promise<{
    id: string;
    status: string;
}>;
export declare function lockEnrollmentClass(tx: Prisma.TransactionClient, classId: string, scope: CampusScope): Promise<{
    id: string;
    status: string;
    capacity: number;
    teacherId: string | null;
}>;
export declare function rejectClientEnrollmentPeriod(body: Record<string, unknown>): void;
export declare function assertCanEndEnrollment(tx: Prisma.TransactionClient, enrollment: Enrollment, endedAt: Date): Promise<void>;
export declare function recordedAttendanceForRemoval(tx: Prisma.TransactionClient, enrollment: Enrollment, endedAt: Date): Promise<string[]>;
export declare function assertEnrollmentCapacity(tx: Prisma.TransactionClient, classId: string, capacity: number): Promise<void>;
export declare function enrollForConversion(tx: Prisma.TransactionClient, studentId: string, classId: string, scope: CampusScope, replaceOld: boolean, enrolledBy?: string): Promise<void>;
export {};
//# sourceMappingURL=enrollmentPeriod.d.ts.map