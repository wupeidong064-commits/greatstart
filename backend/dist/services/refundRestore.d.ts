import type { Enrollment, Prisma, Refund, Student } from '@prisma/client';
type Fields = Pick<Student, 'status' | 'refundDate' | 'refundReason'>;
export declare function refundSnapshot(student: Student, after: Fields, enrollments: Enrollment[], boundary: Date): string;
export declare function prepareRefundRestore(tx: Prisma.TransactionClient, refund: Refund, student: Student, campus: {
    organizationId: string;
    campusId: string;
}): Promise<{
    studentFields: {
        status?: undefined;
        refundReason?: undefined;
        refundDate?: undefined;
    };
    enrollments: Array<{
        id: string;
        name: string;
    }>;
} | {
    studentFields: {
        status: string;
        refundReason: string | null;
        refundDate: Date | null;
    };
    enrollments: {
        id: string;
        name: string;
    }[];
}>;
export {};
//# sourceMappingURL=refundRestore.d.ts.map