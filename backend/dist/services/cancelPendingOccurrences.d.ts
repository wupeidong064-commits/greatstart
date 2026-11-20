import { Prisma } from '@prisma/client';
export declare function cancelPendingOccurrences(tx: Prisma.TransactionClient, scope: {
    organizationId: string;
    campusId: string;
}, classId: string, startTime: Prisma.DateTimeFilter): Promise<number>;
//# sourceMappingURL=cancelPendingOccurrences.d.ts.map