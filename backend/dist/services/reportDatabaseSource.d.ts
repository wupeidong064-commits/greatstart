import type { ReportFileOwner } from './reportFileService';
/** Read current authorized business records through the existing attendance/FIFO rules. */
export declare function reportDatabaseSource(owner: ReportFileOwner, p: {
    kind: string;
    start: string;
    end: string;
}): Promise<any[]>;
//# sourceMappingURL=reportDatabaseSource.d.ts.map