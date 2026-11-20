export interface SnapshotCard {
    title?: string;
    tool?: string;
    caliber?: string;
    timeRange?: {
        start: string;
        end: string;
    } | null;
    generatedAt?: string;
    columns?: Array<{
        key: string;
        label: string;
    }>;
    rows?: Array<Record<string, unknown>>;
    totals?: Record<string, unknown>;
    missing?: string[];
    error?: string | null;
}
/** Fixed OOXML, no HTML, external relationships, macros or user-controlled markup. */
export declare function renderDocx(title: string, institution: string, cards: SnapshotCard[], snapshotVersion?: string, advice?: string): Buffer;
//# sourceMappingURL=aiDocumentRenderer.d.ts.map