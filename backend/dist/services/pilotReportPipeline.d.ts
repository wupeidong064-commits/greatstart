export declare const validateReportRequest: (request: {
    kind?: string;
    periodStart?: unknown;
    periodEnd?: unknown;
}) => {
    kind: string;
    start: string;
    end: string;
    days: number;
};
export declare function runPilotReportPipeline(taskId: string, options?: unknown): Promise<unknown>;
/** 安全校验后读取报告文件（basename 白名单 + 目录包含断言），失败返回 null */
export declare function readPilotReportFile(taskId: string, format: string, files?: Record<string, {
    path?: string;
    sha256?: string;
}>): Buffer | null;
//# sourceMappingURL=pilotReportPipeline.d.ts.map