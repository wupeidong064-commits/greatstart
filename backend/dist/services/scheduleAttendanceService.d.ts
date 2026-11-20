import { LessonSource } from './lessonLedger';
export type AttendanceActor = {
    id: string;
    role?: string;
    organizationId?: string;
    campusId?: string;
};
export type AttendanceEntry = {
    studentId: string;
    status: string;
    temporary?: boolean;
    lessonSource?: LessonSource;
};
export declare const businessDate: (date: Date) => string;
export declare function submitScheduleAttendance(actor: AttendanceActor, scheduleId: string, entries: AttendanceEntry[]): Promise<{
    success: number;
    failed: number;
    results: {
        lessonSource: LessonSource | null;
        paidRemainingLessons: number;
        giftRemainingLessons: number;
        unpricedRemainingLessons: number;
        studentId: string;
        attendanceId: string;
        status: string;
        isTemporary: boolean;
        deducted: number;
        remainingLessons: number;
    }[];
    errors: never[];
}>;
//# sourceMappingURL=scheduleAttendanceService.d.ts.map