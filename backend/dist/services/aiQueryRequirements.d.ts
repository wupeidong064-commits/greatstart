import type { AiIntent } from './aiIntent';
export declare function requestsTable(q: string, intent: AiIntent): boolean;
export declare function scopeClarification(q: string, ownName: string, requested?: string): string | undefined;
export declare function bindUserThreshold(intent: AiIntent, q: string, inherited?: boolean): AiIntent;
/** A count, a historical rate, and a current directory search answer different questions.
 * Bind the measure and the named entity to a capable tool before reading records. */
export declare function alignMeasures(intent: AiIntent, question: string): AiIntent;
export declare function comparisonFactIds(q: string, facts: import('./aiOperatingFacts').OperatingFact[]): string[] | undefined;
//# sourceMappingURL=aiQueryRequirements.d.ts.map