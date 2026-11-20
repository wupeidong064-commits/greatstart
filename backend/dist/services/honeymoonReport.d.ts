import { Prisma } from '@prisma/client';
type Scope = {
    organizationId: string;
    campusId: string;
};
/** One student, one first confirmed new-sale date, one 30-calendar-day period. */
export declare function honeymoonReport(tx: Prisma.TransactionClient, scope: Scope, query: Record<string, unknown>, now?: Date): Promise<{
    students: {
        id: string;
        studentName: string;
        phone: string | null;
        registrationDate: string;
        enrollmentDate: string;
        isUnassigned: boolean;
        daysPassed: number;
        daysRemaining: number;
        classId: string | null;
        className: string;
        classCode: string | null;
        teacher: {
            id: string;
            name: string;
        } | null;
        teachers: {
            id: string;
            name: string;
        }[];
        classes: {
            classId: string;
            className: string;
            classCode: string;
            teacher: {
                id: string;
                name: string;
            } | null;
            expectedAttendance: number;
            actualAttendance: number;
            absentCount: number;
            attendanceRate: number | null;
        }[];
        expectedAttendance: number;
        actualAttendance: number;
        absentCount: number;
        attendanceRate: number | null;
    }[];
    stats: {
        total: number;
        avgAttendanceRate: number | null;
        highAttendance: number;
        lowAttendance: number;
        unratedCount: number;
        unassignedCount: number;
    };
    period: {
        start: string;
        end: string;
    };
    caliberNote: string;
}>;
export {};
//# sourceMappingURL=honeymoonReport.d.ts.map