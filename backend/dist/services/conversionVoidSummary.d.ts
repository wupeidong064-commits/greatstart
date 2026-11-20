import { Prisma } from '@prisma/client';
type Actor = {
    id: string;
    role?: string;
    organizationId?: string;
    campusId?: string;
};
type Filters = {
    studentId?: string;
    salesId?: string;
    startDate?: string;
    endDate?: string;
    unlinkedOnly?: boolean;
    newOnly?: boolean;
};
export declare function conversionVoidSummary(tx: Prisma.TransactionClient, actor: Actor, filters: Filters): Promise<{
    reversedLessons: number;
    unresolvedLogs: number;
}>;
export {};
//# sourceMappingURL=conversionVoidSummary.d.ts.map