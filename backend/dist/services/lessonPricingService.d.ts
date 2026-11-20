import { AuthRequest } from '../middleware/auth';
export declare function getLessonPricing(req: AuthRequest): Promise<{
    studentId: string;
    batches: {
        creditLogId: string;
        originalLessons: number;
        remainingLessons: number | null;
        unpricedConsumedLessons: number;
        businessDate: string | null;
        createdAt: Date;
        amount: number | null;
        pricingStatus: string;
        canPrice: boolean;
        reason: string | null;
        orderCandidates: {
            orderId: string;
            originalLessons: number;
            amount: number;
            conversionDate: string;
        }[];
    }[];
    unpricedRemainingLessons: number;
}>;
export declare function confirmLessonPricing(req: AuthRequest): Promise<{
    studentId: string;
    creditLogId: string;
    originalLessons: number;
    amount: number;
    basisType: string;
    orderId: string | null;
    notes: string;
    requestId: string;
    createdAt: Date;
}>;
//# sourceMappingURL=lessonPricingService.d.ts.map