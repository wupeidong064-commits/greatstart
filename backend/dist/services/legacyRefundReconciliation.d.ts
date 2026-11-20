import type { Prisma } from '@prisma/client';
type LegacyLog = {
    id: string;
    studentId: string;
    type: string;
    lessons: number;
    notes: string | null;
    reversalOfId: string | null;
    refundId: string | null;
    conversionId: string | null;
    createdAt: Date;
    lessonSource: string | null;
    scheduleId: string | null;
    allocations: unknown;
};
export type RefundMatch = {
    debitId: string;
    refundId: string;
};
export declare function legacyRefundMatches(tx: Prisma.TransactionClient, org: string, logs: LegacyLog[], gifts: Set<string>): Promise<Map<string, RefundMatch>>;
export {};
//# sourceMappingURL=legacyRefundReconciliation.d.ts.map