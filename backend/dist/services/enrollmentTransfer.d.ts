import { Prisma } from '@prisma/client';
export declare function transferRequest(body: Record<string, unknown>): {
    studentId: string;
    toClassId: string;
    ids: string[];
    legacyClassId: string | undefined;
    batch: boolean;
    notes: string | undefined;
};
export declare function transferEnrollments(tx: Prisma.TransactionClient, request: ReturnType<typeof transferRequest>, actor: {
    id: string;
    organizationId: string;
    campusId: string;
}): Promise<{
    transfers: {
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        notes: string | null;
        status: string;
        studentId: string;
        toClassId: string;
        fromClassId: string;
        transferredLessons: number;
        priceDifference: Prisma.Decimal | null;
        refundAmount: Prisma.Decimal | null;
        operatedBy: string | null;
        operatedByName: string | null;
    }[];
    replayed: boolean;
}>;
//# sourceMappingURL=enrollmentTransfer.d.ts.map