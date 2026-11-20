import { Prisma } from '@prisma/client';
export type ScheduleSlot = {
    organizationId: string;
    campusId: string | null;
    classId: string;
    courseId?: string | null;
    teacherId: string | null;
    startTime: Date;
    endTime: Date;
    classroom: string | null;
};
/** One lock for all timetable mutations in an institution. Always acquire before
 * occurrence locks. Attendance only acquires occurrence -> student locks, never
 * this lock. The two-int advisory namespace is separate from existing bigint locks. */
export declare function lockScheduleWrites(tx: Prisma.TransactionClient, organizationId: string): Promise<void>;
export declare const CLASS_PAUSED = "class_paused";
export declare function hiddenTimetableOccurrence(): Prisma.ScheduleWhereInput;
export declare function normalizeClassroom(value: unknown): string | null;
export declare function validateScheduleTime(start: Date, end: Date): void;
export declare function parseScheduleTime(value: unknown): Date;
/** Caller must hold lockScheduleWrites in the same transaction through the write.
 * Returns a reusable occurrence only for an explicitly allowed exact create retry.
 * Existing rooms are normalized at comparison time, without rewriting history. */
export declare function assertScheduleAvailable(tx: Prisma.TransactionClient, slot: ScheduleSlot, options?: {
    excludeIds?: string[];
    allowExactReuse?: boolean;
    inheritCourse?: boolean;
}): Promise<{
    id: string;
    organizationId: string;
    campusId: string | null;
    createdAt: Date;
    updatedAt: Date;
    notes: string | null;
    status: string;
    teacherId: string | null;
    classId: string;
    startTime: Date;
    courseId: string | null;
    endTime: Date;
    classroom: string | null;
    isRecurring: boolean;
    recurrenceRule: string | null;
    originalScheduleId: string | null;
    lessonIndex: number | null;
    weekNumber: number | null;
    scheduleGroupId: string | null;
} | undefined>;
/** 生成结果的共存提醒（2026-11-07 用户拍板的重复提示三档口径）：
 *  墙钟重叠但硬冲突检查放行的场次——不同班级/老师/教室的课，以及已停课班级的场次
 *  （停课即释放时间，可照常排，但操作者应知道"该时间点已有一节课"）。
 *  本班 scheduled 的重叠行是幂等复用对象本身，不进提醒。 */
export type CoexistingNote = {
    scheduleId: string;
    startTime: Date;
    endTime: Date;
    className: string;
    teacherName: string | null;
    sessionStatus: string;
    classStatus: string;
};
export declare function findCoexistingSessions(tx: Prisma.TransactionClient, slot: ScheduleSlot, options?: {
    excludeIds?: string[];
}): Promise<CoexistingNote[]>;
//# sourceMappingURL=scheduleConflicts.d.ts.map