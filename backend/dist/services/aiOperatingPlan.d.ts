import type { AiIntent } from './aiIntent';
import type { BusinessCalendar } from './aiBusinessCalendar';
import { PlannedToolCall } from './aiTools';
export declare function businessToday(): string;
export declare function supportsHistoricalPeriod(tool: PlannedToolCall): boolean;
/** Bind business dates before validating required tool arguments, including after a repair.
 * Model-supplied date strings have no authority over the actual database predicate. */
export declare function calendarTools(intent: AiIntent, cal: BusinessCalendar): PlannedToolCall[];
export declare function exceedsCalendarToolLimit(tools: PlannedToolCall[]): boolean;
//# sourceMappingURL=aiOperatingPlan.d.ts.map