import type { EvidenceCard } from './aiTools';
type Period = {
    start: string;
    end: string;
};
export type Coverage = 'complete' | 'partial' | 'missing' | 'zero_denominator' | 'failed';
export interface OperatingFact {
    id: string;
    kind: 'metric' | 'distribution' | 'list' | 'comparison' | 'missing';
    metric: string;
    entityId: string;
    entityName: string;
    campusId: string | null;
    scopeKey: string;
    period: Period | null;
    source: string;
    sourceTitle: string;
    asOf: string;
    label: string;
    value: number | string | null;
    unit: string;
    coverage: Coverage;
    formula: string;
    numerator?: number;
    denominator?: number;
    bins?: Array<{
        rate: number;
        count: number;
    }>;
    rows?: string[];
    refs?: string[];
    showByDefault?: boolean;
    detailOnly?: boolean;
}
export interface OperatingSnapshot {
    version: string;
    facts: OperatingFact[];
}
export declare function evidenceUnit(key: string): string;
export declare function fullMonth(p: Period): boolean;
/** Abbreviations are display labels only. Joins, ranking and saved references retain the complete ID. */
export declare function entityDisplayNames(people: Array<{
    id: string;
    name: string;
    classes?: string[];
}>): Map<string, string>;
export declare function evaluateMonthlyTarget(actual: number, goal: unknown, period: Period, today: string, covered: boolean): {
    difference: null;
    percent: null;
    note: string;
} | {
    difference: number;
    percent: number | null;
    note: string;
};
export declare function comparablePeriods(current: Period, previous: Period): boolean;
export declare function compareOperatingFacts(current: OperatingFact, previous: OperatingFact): {
    delta: number;
    unit: string;
    percent: number | null;
    direction: string;
} | null;
export declare function buildOperatingSnapshot(cards: EvidenceCard[]): OperatingSnapshot;
export declare function operatingSnapshotVersion(cards: Partial<EvidenceCard>[]): string;
export declare function renderOperatingFacts(snapshot: OperatingSnapshot, opts?: {
    factIds?: string[];
    includeRows?: boolean;
    compare?: boolean;
}): string;
export {};
//# sourceMappingURL=aiOperatingFacts.d.ts.map