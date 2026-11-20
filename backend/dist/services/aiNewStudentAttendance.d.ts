import type { Evidence, ToolContext } from './aiTools';
export interface NewStudentSnapshot {
    orders: Array<{
        id: string;
        studentId: string | null;
        studentName: string;
        conversionDate: string;
    }>;
    firstSales: Array<{
        studentId: string | null;
        _min: {
            conversionDate: string | null;
        };
    }>;
    students: Array<{
        id: string;
        name: string;
        status: string;
    }>;
    enrollments: Array<{
        studentId: string;
        classId: string;
        enrolledAt: Date;
        endedAt: Date | null;
        status: string;
        class: {
            name: string;
            teacher: {
                name: string;
            } | null;
        };
    }>;
    schedules: Array<{
        id: string;
        classId: string;
        startTime: Date;
        endTime: Date | null;
    }>;
    attendances: Array<{
        studentId: string;
        classId: string;
        scheduleId: string;
        status: string;
        isTemporary: boolean;
    }>;
}
/** Classify by saved student identity and occurrence eligibility, never by a matching name. */
export declare function summarizeNewStudentAttendance(data: NewStudentSnapshot, start: string, end: string, cutoff: Date): {
    rows: Record<string, string | number>[];
    totals: {
        期间新签订单数: number;
        首次新签可核学员数: number;
        已到课学员数: number;
        暂无到课记录学员数: number;
        关联待核成单笔数: number;
        剔除非首次新签学员数: number;
    };
};
export declare function newStudentAttendance(ctx: ToolContext, params: Record<string, unknown>, now?: Date): Promise<Evidence>;
//# sourceMappingURL=aiNewStudentAttendance.d.ts.map