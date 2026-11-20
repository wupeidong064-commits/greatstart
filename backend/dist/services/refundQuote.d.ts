import { Prisma, type Student } from '@prisma/client';
export declare function refundDay(value: unknown, label: string, end?: boolean): Date;
export declare function quoteRefund(tx: Prisma.TransactionClient, student: Student, lessons: number): Promise<{
    lessonsToRefund: number;
    allocations: import("./lessonLedger").Allocation[];
    giftLessons: number;
    unpricedLessons: number;
    knownAmount: number;
    cashAvailable: number | null;
    maxAmount: number | null;
    paidRemainingLessons: number;
    giftRemainingLessons: number;
    unpricedRemainingLessons: number;
    studentId: string;
    remainingLessons: number;
}>;
export declare function validateRefundQuote(quote: Awaited<ReturnType<typeof quoteRefund>>, amount: Prisma.Decimal): void;
export declare function requireFullRefund(remainingLessons: number, lessonsToRefund: number): void;
//# sourceMappingURL=refundQuote.d.ts.map