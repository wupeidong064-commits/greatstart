import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
type Actor = NonNullable<AuthRequest['user']>;
export type ClassAssignment = {
    classId: string;
    toTeacherId: string;
};
export type BatchHandoverInput = {
    fromTeacherId: string;
    assignments: ClassAssignment[];
    notes: string;
    requestId?: string;
};
export declare function batchHandoverInput(body: any, executing?: boolean): BatchHandoverInput;
export declare function planBatchHandover(tx: Prisma.TransactionClient, actor: Actor, input: BatchHandoverInput): Promise<{
    plans: {
        from: {
            password: string;
            role: string;
            managementLevel: string;
            isPlatformAdmin: boolean;
            id: string;
            email: string | null;
            name: string;
            phone: string | null;
            organizationId: string | null;
            campusId: string | null;
            isActive: boolean;
            managementGrantedById: string | null;
            managementGrantedAt: Date | null;
            lastLoginAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        };
        to: {
            password: string;
            role: string;
            managementLevel: string;
            isPlatformAdmin: boolean;
            id: string;
            email: string | null;
            name: string;
            phone: string | null;
            organizationId: string | null;
            campusId: string | null;
            isActive: boolean;
            managementGrantedById: string | null;
            managementGrantedAt: Date | null;
            lastLoginAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        };
        classes: {
            id: string;
            name: string;
            organizationId: string;
            campusId: string | null;
            status: string;
        }[];
        pending: ({
            class: {
                name: string;
                status: string;
            };
        } & {
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
        })[];
        conflicts: {
            className: string;
            startTime: Date;
            endTime: Date;
            conflictingClassName: string;
            conflictingStartTime: Date;
            conflictingEndTime: Date;
        }[];
        details: {
            classes: string[];
            schedules: string[];
            classCount: number;
            scheduleCount: number;
            studentCount: number;
        };
    }[];
    preview: {
        items: {
            classId: string;
            className: string;
            toTeacherId: string;
            toTeacherName: string;
            status: "conflict" | "ready";
            conflicts: {
                className: string;
                startTime: Date;
                endTime: Date;
                conflictingClassName: string;
                conflictingStartTime: Date;
                conflictingEndTime: Date;
                classId: string;
            }[];
            details: {
                classes: string[];
                schedules: string[];
                classCount: number;
                scheduleCount: number;
                studentCount: number;
            };
        }[];
        readyCount: number;
        conflictCount: number;
        remainingClassCount: number;
    };
}>;
export declare function executeBatchHandover(tx: Prisma.TransactionClient, actor: Actor, input: BatchHandoverInput): Promise<string | number | true | Prisma.JsonObject | Prisma.JsonArray | {
    batchId: `${string}-${string}-${string}-${string}-${string}`;
    details: {
        classCount: number;
        scheduleCount: number;
        studentCount: number;
    };
    remainingClassCount: number;
    transfers: {
        classId: string;
        className: string;
        toTeacherId: string;
        toTeacherName: string;
        scheduleCount: number;
        studentCount: number;
    }[];
}>;
export {};
//# sourceMappingURL=batchClassHandover.d.ts.map