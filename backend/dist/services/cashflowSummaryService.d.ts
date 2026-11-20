import { Prisma } from '@prisma/client';
import { RequestScope } from '../utils/scope';
export declare function orderScope({ organizationId, campusId }: RequestScope): Prisma.ConversionWhereInput;
export declare function getCashflowSummary(scope: RequestScope, query: Record<string, unknown>): Promise<{
    version: number;
    period: {
        startDate: string;
        endDate: string;
        timezone: string;
    };
    generatedAt: string;
    staffOptions: {
        id: string;
        name: string;
    }[];
    scopeNotes: string[];
    caliber: {
        orders: string;
        experience: string;
        renewal: string;
        refund: string;
    };
    totals: {
        grossAmount: number;
        netAmount: number | null;
        orderCount: number;
    };
    newSignup: {
        conversions: number;
        amount: number;
        totalLeads: number;
        invitedExperience: number;
        scheduledExperience: number;
        attendedExperience: number;
        convertedExperience: number;
        conversionRate: number | null;
    };
    renewal: {
        threshold: number;
        count: number;
        amount: number;
        renewedStudents: number;
        pendingStudents: number;
        outstandingStudents: number;
        totalEligible: number;
        renewalRate: number | null;
    };
    refund: {
        count: number;
        amount: number;
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
    };
    daily: {
        date: string;
        newSignupAmount: number;
        renewalAmount: number;
        refundAmount: number;
        netAmount: number | null;
    }[];
}>;
//# sourceMappingURL=cashflowSummaryService.d.ts.map