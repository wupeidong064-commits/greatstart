type LowAttendanceEvidence = {
    tool: string;
    rows: Array<Record<string, unknown>>;
    timeRange?: {
        start: string;
        end: string;
    } | null;
    error?: string | null;
};
/** Advice requests are buffered so unsupported grouped counts are never streamed first. */
export declare function isManagementAdvice(question: string): boolean;
export declare function guardManagementAdvice(answer: string, evidence: LowAttendanceEvidence[]): string;
export {};
//# sourceMappingURL=aiAdviceGuard.d.ts.map