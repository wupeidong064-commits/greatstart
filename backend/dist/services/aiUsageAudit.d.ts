/** Institution billing metadata only: conversation text, upload IDs and private file names are excluded. */
export declare function usageSummary(scope: {
    organizationId: string;
    campusId: string | null;
}, start: string, end: string): Promise<{
    period: {
        start: string;
        end: string;
    };
    totals: {
        inputTokens: number | null;
        outputTokens: number | null;
        tasks: number;
        modelCalls: number;
        knownInputTokens: number;
        knownOutputTokens: number;
        incompleteTasks: number;
        settledMicros: number;
    };
    daily: {
        day: string;
        tasks: number;
        modelCalls: number;
        knownInputTokens: number;
        knownOutputTokens: number;
        incompleteTasks: number;
        syntheticTasks: number;
        reservedMicros: number;
        settledMicros: number;
        releasedMicros: number;
    }[];
    models: {
        model: string;
        tasks: number;
        calls: number;
        knownInputTokens: number;
        knownOutputTokens: number;
        incompleteTasks: number;
        synthetic: boolean;
    }[];
    billIds: string[];
    supplierCost: null;
    caliber: string;
}>;
//# sourceMappingURL=aiUsageAudit.d.ts.map