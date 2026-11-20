import AdmZip from 'adm-zip';
import type { ReportFileOwner } from './reportFileService';
import type { Evidence } from './aiTools';
export declare const UPLOAD_DIR: string;
export interface UploadTable {
    name: string;
    headerRow: number;
    sourceRows?: Array<{
        row: number;
        values: Array<string | number | boolean | null>;
    }>;
    headers: string[];
    rows: Array<{
        source: string;
        values: Array<string | number | boolean | null>;
    }>;
}
export interface ParsedUpload {
    tables: UploadTable[];
    paragraphs: Array<{
        source: string;
        text: string;
    }>;
    issues: string[];
    rowCount: number;
}
export interface UploadMapping {
    table: string;
    nameColumn: string;
    balanceColumn?: string;
    amountColumn?: string;
    amountUnit?: '元' | '万元';
}
export interface StoredUpload extends ParsedUpload {
    id: string;
    owner: ReportFileOwner;
    fileName: string;
    hash: string;
    createdAt: string;
    expiresAt: string;
    mapping: UploadMapping[];
    reportImport?: Record<string, unknown>;
}
export declare function checkedZip(buf: Buffer): AdmZip;
export declare function parseUpload(buf: Buffer, fileName: string): ParsedUpload;
export declare function saveUpload(owner: ReportFileOwner, buf: Buffer, name: string): {
    id: string;
    fileName: string;
    hash: string;
    createdAt: string;
    expiresAt: string;
    mapping: UploadMapping[];
    reportImport?: Record<string, unknown>;
    tables: UploadTable[];
    paragraphs: Array<{
        source: string;
        text: string;
    }>;
    issues: string[];
    rowCount: number;
};
export declare function ownedUpload(owner: ReportFileOwner, id: string): StoredUpload;
export declare function getUpload(owner: ReportFileOwner, id: string): {
    id: string;
    fileName: string;
    hash: string;
    createdAt: string;
    expiresAt: string;
    mapping: UploadMapping[];
    reportImport?: Record<string, unknown>;
    tables: UploadTable[];
    paragraphs: Array<{
        source: string;
        text: string;
    }>;
    issues: string[];
    rowCount: number;
};
export declare function removeUpload(owner: ReportFileOwner, id: string): void;
export declare function mapUpload(owner: ReportFileOwner, id: string, mapping: UploadMapping[]): {
    id: string;
    fileName: string;
    hash: string;
    createdAt: string;
    expiresAt: string;
    mapping: UploadMapping[];
    reportImport?: Record<string, unknown>;
    tables: UploadTable[];
    paragraphs: Array<{
        source: string;
        text: string;
    }>;
    issues: string[];
    rowCount: number;
};
export declare function uploadEvidence(owner: ReportFileOwner, ids: string[]): Promise<Evidence[]>;
/** Bind a confirmed report receipt without touching business records. */
export declare function bindReportImport(owner: ReportFileOwner, ids: string[], receipt: Record<string, unknown>): {
    id: string;
    fileName: string;
    hash: string;
    createdAt: string;
    expiresAt: string;
    mapping: UploadMapping[];
    reportImport?: Record<string, unknown>;
    tables: UploadTable[];
    paragraphs: Array<{
        source: string;
        text: string;
    }>;
    issues: string[];
    rowCount: number;
}[];
//# sourceMappingURL=aiUploadService.d.ts.map