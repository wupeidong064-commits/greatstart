import type { ReportFileOwner } from './reportFileService';
export declare function reportRequest(text: string, today: string, previous?: {
    kind?: string;
    start?: string;
    end?: string;
}): {
    kind: string;
    start: string;
    end: string;
    days: number;
} | {
    needsPeriod: boolean;
    kind: string | undefined;
    error: string;
} | {
    needsPeriod: boolean;
    kind: string | undefined;
    error?: undefined;
} | null;
export declare function previewReportImport(owner: ReportFileOwner, body: any): {
    publicData: any;
    parsed: any;
    digest: string;
    uploads: import("./aiUploadService").StoredUpload[];
    ids: string[];
};
export declare function confirmReportImport(owner: ReportFileOwner, body: any): {
    receipt: {
        receiptId: `${string}-${string}-${string}-${string}-${string}`;
        digest: string;
        confirmed: boolean;
        rows: any;
        coverage: any;
        issues: any;
    };
    uploads: {
        id: string;
        fileName: string;
        hash: string;
        createdAt: string;
        expiresAt: string;
        mapping: import("./aiUploadService").UploadMapping[];
        reportImport?: Record<string, unknown>;
        tables: import("./aiUploadService").UploadTable[];
        paragraphs: Array<{
            source: string;
            text: string;
        }>;
        issues: string[];
        rowCount: number;
    }[];
};
export declare function createOperatingReport(owner: ReportFileOwner, request: any, uploadIds: string[], requestId: string, previousReceiptIds?: string[], signal?: AbortSignal): Promise<{
    error: string | null;
    id: string;
    organizationId: string;
    campusId: string | null;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    requestId: string;
    createdById: string;
    kind: string;
    periodStart: string;
    periodEnd: string;
    compareStart: string | null;
    compareEnd: string | null;
    snapshotDate: string | null;
    progress: number;
    progressLabel: string | null;
    content: import("@prisma/client/runtime/library").JsonValue | null;
    versions: import("@prisma/client/runtime/library").JsonValue | null;
}>;
export declare function reportCards(task: any): ({
    tool: string;
    type: string;
    evidenceId: string;
    fileId: string;
    title: any;
    status: string;
    timeRange: any;
    columns: never[];
    rows: never[];
    fileName: string;
    downloadUrl: string;
    canRetry: boolean;
} | {
    tool: string;
    evidenceId: string;
    reportId: any;
    title: any;
    timeRange: any;
    columns: never[];
    rows: never[];
    totals: {
        分析状态: string;
    };
    previewUrl: string;
})[];
export declare function reportAnswer(task: any): string;
//# sourceMappingURL=operatingReportService.d.ts.map