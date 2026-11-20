import { Prisma } from '@prisma/client';
type Scope = {
    organizationId: string;
    campusId: string;
};
export declare function classAttendanceFilters(query: Record<string, unknown>): {
    start: Date | undefined;
    end: Date | undefined;
    teacherId: string | undefined;
    maxAttendanceRate: number | undefined;
};
export declare function classAttendanceSessions(tx: Prisma.TransactionClient, scope: Scope, classId: string, query: Record<string, unknown>): Promise<{
    data: {
        id: string;
        startTime: Date;
        endTime: Date;
        status: string;
        expectedAttendance: number;
        actualAttendance: number;
        attendanceRate: number | null;
        markedStudents: number;
    }[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}>;
export {};
//# sourceMappingURL=classAttendanceReport.d.ts.map