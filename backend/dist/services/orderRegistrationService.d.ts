import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { RegistrationActor } from './registrationRequestService';
export declare function orderRegistrationSchedules(actor: RegistrationActor): Promise<{
    period: {
        start: Date;
        end: Date;
        timezone: "Asia/Shanghai";
    };
    schedules: {
        id: string;
        classId: string;
        className: string;
        classCode: string;
        courseType: string | null;
        startTime: string;
        endTime: string;
        classroom: string | null;
        teacherId: string | null;
        teacherName: string | null;
    }[];
}>;
export declare function orderAccess(actor: RegistrationActor): Prisma.ConversionWhereInput;
export declare function registerOrder(req: AuthRequest): Promise<{
    data: {
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        address: string | null;
        gender: string | null;
        parentName: string | null;
        notes: string | null;
        salesId: string | null;
        studentId: string | null;
        reviewedById: string | null;
        reviewedAt: Date | null;
        courseType: string | null;
        classId: string | null;
        age: number | null;
        contact: string;
        studentName: string;
        className: string | null;
        leadId: string | null;
        registrationSchedule: Prisma.JsonValue | null;
        totalLessons: number | null;
        price: Prisma.Decimal | null;
        paymentMethod: string | null;
        paymentStatus: string | null;
        salesName: string | null;
        conversionDate: string;
        experienceLessonId: string | null;
        approvalStatus: string;
        rejectReason: string | null;
    };
    status: "legacy";
} | {
    data: Prisma.JsonValue;
    status: "replayed";
} | {
    data: {
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        address: string | null;
        gender: string | null;
        parentName: string | null;
        notes: string | null;
        salesId: string | null;
        studentId: string | null;
        reviewedById: string | null;
        reviewedAt: Date | null;
        courseType: string | null;
        classId: string | null;
        age: number | null;
        contact: string;
        studentName: string;
        className: string | null;
        leadId: string | null;
        registrationSchedule: Prisma.JsonValue | null;
        totalLessons: number | null;
        price: Prisma.Decimal | null;
        paymentMethod: string | null;
        paymentStatus: string | null;
        salesName: string | null;
        conversionDate: string;
        experienceLessonId: string | null;
        approvalStatus: string;
        rejectReason: string | null;
    };
    status: "created";
}>;
//# sourceMappingURL=orderRegistrationService.d.ts.map