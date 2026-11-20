import type { AiIntent } from './aiIntent';
export declare const SCOPE_REPLY = "\u6211\u53EA\u5904\u7406\u672C\u673A\u6784\u7684\u8BFE\u52A1\u3001\u62DB\u751F\u3001\u5B66\u5458\u548C\u7ECF\u8425\u5206\u6790\u3002\u53EF\u4EE5\u95EE\uFF1A\u672C\u6708\u6210\u5355\u548C\u9000\u8D39\u5404\u591A\u5C11\uFF1F";
export declare function businessScope(question: string, hasPrevious: boolean, hasUploads?: boolean): 'business' | 'unrelated' | 'clarify';
export declare function workbenchHelpIntent(q: string, hasUploads?: boolean): AiIntent | undefined;
export declare function naturalAttendanceIntent(q: string, today: string): AiIntent | undefined;
export declare function requestedFormats(question: string): Array<'xlsx' | 'docx'>;
export declare function isFileRequest(q: string): boolean;
/** Financial ambiguity must be resolved before querying, for every provider. */
export declare function criticalMetricClarification(q: string): AiIntent | undefined;
/** App follow-up semantics: the sale cohort is dated, attendance is observed through today. */
export declare function newStudentAttendanceIntent(q: string, today: string): AiIntent | undefined;
/** Resolve explicit business concepts without treating their Chinese labels as DB statuses. */
export declare function normalizeBusinessFilters(q: string, intent: AiIntent): AiIntent;
export declare function classClarificationPlan(q: string, intent: AiIntent, today: string): AiIntent;
/** Deterministic baseline for mock only. Real-model classification is separately verified. */
export declare function localBusinessIntent(q: string, today: string): AiIntent;
export declare function isPurePresentationRequest(text: string): boolean;
/** Restore only structured, owned evidence, never assistant prose or another conversation. */
export declare function inheritPreviousIntent(q: string, intent: AiIntent, previous: any[], today: string): AiIntent;
/** Scope-wide order totals have one stable route; named people/classes still use entity resolution. */
export declare function orderMetricIntent(q: string, today: string): AiIntent | undefined;
//# sourceMappingURL=aiWorkbenchPolicy.d.ts.map