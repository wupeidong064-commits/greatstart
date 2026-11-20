import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
export declare const teachingRoles: string[];
export declare const sourceRoles: string[];
export type HandoverInput = {
    fromTeacherId: string;
    toTeacherId: string;
    classIds?: string[];
    notes?: string;
};
export declare function handoverInput(body: any): HandoverInput;
/** Same lock order as staff deactivation. Recheck authority after waiting. */
export declare function lockHandover(tx: Prisma.TransactionClient, actor: NonNullable<AuthRequest['user']>): Promise<{
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
}>;
export declare function planHandover(tx: Prisma.TransactionClient, actor: NonNullable<AuthRequest['user']>, input: HandoverInput, now?: Date): Promise<{
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
}>;
export declare function assertHandoverAvailable(plan: Awaited<ReturnType<typeof planHandover>>): void;
export declare function applyHandover(tx: Prisma.TransactionClient, plan: Awaited<ReturnType<typeof planHandover>>, deferRecallSync?: boolean): Promise<void>;
//# sourceMappingURL=resourceHandover.d.ts.map