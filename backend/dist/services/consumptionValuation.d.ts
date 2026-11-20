import { Prisma } from '@prisma/client';
type Scope = {
    organizationId: string;
    campusId: string;
};
type Money = {
    cents: number;
    unpricedLessons: number;
};
export declare function consumptionMoney(value: Money): {
    actualConsumptionAmount: number;
    knownConsumptionAmount: number;
    unpricedConsumptionLessons: number;
    monetaryHistoryComplete: boolean;
};
/** Read only. A correction belongs to the original debit's course/activity date,
 * and returns precisely its recorded allocation instead of using today's price. */
export declare function readConsumptionValuation(tx: Prisma.TransactionClient, scope: Scope, scheduleIds: string[], activityPeriod?: {
    start: Date;
    end: Date;
}): Promise<{
    bySchedule: Map<string, Money>;
    actualConsumptionAmount: number;
    knownConsumptionAmount: number;
    unpricedConsumptionLessons: number;
    monetaryHistoryComplete: boolean;
}>;
export {};
//# sourceMappingURL=consumptionValuation.d.ts.map