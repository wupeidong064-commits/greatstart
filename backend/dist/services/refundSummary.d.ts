import type { Prisma } from '@prisma/client';
import { RequestScope } from '../utils/scope';
export declare function refundSummary(scope: RequestScope, start?: Date, end?: Date, client?: Prisma.TransactionClient): Promise<{
    approvedCount: number;
    approvedAmount: number;
    approvedLessons: number;
    cancelledCount: number;
    cancelledAmount: number;
    actualPaidCount: number;
    actualPaidAmount: number;
    cashReceipts: number;
    netCashFlow: number;
    caliber: string;
}>;
//# sourceMappingURL=refundSummary.d.ts.map