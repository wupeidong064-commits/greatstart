import type { Prisma } from '@prisma/client';
export declare function wasEnrolled(e: {
    enrolledAt: Date | string | null;
    endedAt?: Date | string | null;
    status: string;
}, end: Date | number | string): boolean;
export interface SessionAttendanceInput {
    /** 场次（startTime/endTime/classId） */
    schedules: Array<{
        id: string;
        classId: string;
        startTime: Date;
        endTime: Date | null;
    }>;
    /** 报名（含入班时间与状态） */
    enrollments: Array<{
        classId: string;
        studentId: string;
        enrolledAt: Date | null;
        endedAt?: Date | null;
        status: string;
    }>;
    /** 出勤记录（按场次） */
    attendances: Array<{
        studentId?: string;
        scheduleId: string;
        classId: string;
        status: string;
        isTemporary?: boolean;
    }>;
}
export interface SessionAttendanceResult {
    expected: number;
    present: number;
    rate: number | null;
    perClass: Array<{
        classId: string;
        sessions: number;
        expected: number;
        present: number;
        rate: number | null;
    }>;
    caliberNote: string;
}
export declare const SESSION_ATTENDANCE_CALIBER = "\u5E94\u5230\u6309\u6BCF\u6B21\u8BFE\u7ED3\u675F\u65F6\u7684\u6709\u6548\u5165\u73ED\u540D\u5355\u53BB\u91CD\uFF1B\u5DF2\u8BB0\u5F55\u79BB\u73ED\u65F6\u95F4\u7684\u62A5\u540D\u53EA\u8BA1\u79BB\u73ED\u524D\u573A\u6B21\u3002\u5386\u53F2\u8F6C\u73ED\u3001\u53D6\u6D88\u65E0\u7ED3\u675F\u65F6\u95F4\u7684\u4E0D\u5012\u63A8\u3002\u5DF2\u4FDD\u5B58\u4E34\u65F6\u4E32\u8BFE\u5B66\u5458\u53EA\u8BA1\u5165\u5BF9\u5E94\u573A\u6B21\u5E94\u5230\uFF0C\u4E0D\u6539\u53D8\u62A5\u540D\uFF1B\u5B9E\u5230\u8BA1\u51FA\u52E4\u548C\u8FDF\u5230\uFF1B\u65E0\u5E94\u5230\u65F6\u4E0D\u663E\u793A\u6BD4\u7387\u3002";
export declare function computeSessionAttendance(input: SessionAttendanceInput): SessionAttendanceResult;
/** Per-student facts use the same eligible occurrence pairs, including saved guests. */
export declare function computeStudentSessions(input: SessionAttendanceInput): {
    continuousAbsentCount: number;
    isTemporary: boolean;
    expected: number;
    present: number;
    rate: number | null;
    perClass: Array<{
        classId: string;
        sessions: number;
        expected: number;
        present: number;
        rate: number | null;
    }>;
    caliberNote: string;
    classId: string;
    studentId: string;
}[];
/** 查库版（AI 工具用）：按校区/班级集合与时间窗口取数后走同一公式 */
export declare function querySessionAttendance(args: {
    organizationId: string;
    campusId?: string | null;
    classIds: string[];
    startISO?: string;
    endISO?: string;
}, db?: Prisma.TransactionClient): Promise<SessionAttendanceResult>;
//# sourceMappingURL=attendanceStatsService.d.ts.map