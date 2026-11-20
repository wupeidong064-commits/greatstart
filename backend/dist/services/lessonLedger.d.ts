import { Prisma } from '@prisma/client';
export type LessonSource = 'paid' | 'gift';
type StudentBalance = {
    id: string;
    remainingLessons: number;
    purchasedLessons?: number;
    consumedLessons?: number;
};
type Range = {
    start: number;
    lessons: number;
};
export type Allocation = Range & {
    lotId: string;
    amountCents: number | null;
};
type Value = {
    allocations: Allocation[];
    amountCents: number;
    unpricedLessons: number;
    lessonSource: LessonSource;
};
declare const logSelect: {
    id: true;
    studentId: true;
    type: true;
    lessons: true;
    scheduleId: true;
    reversalOfId: true;
    conversionId: true;
    lessonSource: true;
    allocations: true;
    creditAmountCents: true;
    notes: true;
    businessDate: true;
    refundId: true;
    purchasedReduction: true;
    createdAt: true;
    ledgerSequence: true;
};
type Log = Prisma.LessonLogGetPayload<{
    select: typeof logSelect;
}>;
type PriceEvidence = {
    id: string;
    studentId: string;
    creditLogId: string;
    originalLessons: number;
    amountCents: Prisma.Decimal;
    orderId: string | null;
};
type Order = {
    id: string;
    studentId: string | null;
    price: Prisma.Decimal | null;
    totalLessons: number | null;
    conversionDate: string;
    approvalStatus: string;
};
export declare function creditCents(price: number | Prisma.Decimal | null, lessons: number, orderLessons: number | null): number | null;
export declare class LessonLedger {
    private readonly supplements;
    constructor(supplements?: Map<string, PriceEvidence>);
    private traceableCredits;
    private supplementedCredits;
    creditDetail(id: string): {
        source: LessonSource;
        cents: number | null;
        remaining: number;
        retired: boolean;
        traceable: boolean;
    } | undefined;
    reconciliationRequired: boolean;
    assertWritable(): void;
    private lots;
    readonly ambiguousDebits: Set<string>;
    readonly valuations: Map<string, Value>;
    readonly activeBySchedule: Map<string, string>;
    readonly reversed: Set<string>;
    private retiredLots;
    private refundLogs;
    private verifiedCredits;
    private openingAlias?;
    readonly valuationEvidence: Map<string, {
        recorded: Allocation[];
        verified: Allocation[];
        orderIds: string[];
        refundIds: string[];
        pricingIds: string[];
    }>;
    certifyOpening(before: number, refundIds: string[]): void;
    verifiedParts(raw: Prisma.JsonValue | Allocation[], logId?: string): Allocation[];
    outstandingRefundsIn(lotId: string): number;
    get balance(): {
        paidRemainingLessons: number;
        giftRemainingLessons: number;
        unpricedRemainingLessons: number;
    };
    credit(id: string, size: number, cents: number | null, source?: LessonSource, spent?: boolean): void;
    availableIn(id: string | undefined): number | null;
    take(count: number, source: LessonSource | 'any', preferredId?: string): Allocation[];
    apply(parts: Allocation[], restore: boolean): void;
    reverse(id: string): Value;
    replay(log: Log, orders: Map<string, Order>, gifts: Set<string>, creditRefs: Map<string, string>): void;
    unresolved(logs: Log[], remaining: number, proven?: LessonLedger, gifts?: Set<string>): void;
}
export declare function readLessonLedgers(db: Prisma.TransactionClient, students: StudentBalance[], organizationId: string): Promise<Map<string, LessonLedger>>;
export declare function readStudentLedger(tx: Prisma.TransactionClient, student: StudentBalance, org: string): Promise<LessonLedger>;
export {};
//# sourceMappingURL=lessonLedger.d.ts.map