import { Prisma } from '@prisma/client';
export declare const printedOrderId: (notes: string | null) => string | undefined;
export declare function readOrderEvidence(tx: Prisma.TransactionClient, organizationId: string, ids: string[]): Promise<{
    allows(orderId: string, studentId: string, creditId?: string, alreadyLinked?: boolean): boolean;
}>;
//# sourceMappingURL=lessonOrderEvidence.d.ts.map