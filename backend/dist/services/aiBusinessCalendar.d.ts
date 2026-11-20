import type { AiIntent } from './aiIntent';
export interface BusinessPeriod {
    start: string;
    end: string;
}
export interface BusinessCalendar {
    observation: BusinessPeriod;
    target?: BusinessPeriod;
    comparison?: BusinessPeriod;
    asOfDate: string;
    explicit: boolean;
    singleDayMention?: boolean;
    clarification?: string;
}
interface CalendarInput {
    question: string;
    today: string;
    intent?: AiIntent;
    previous?: Partial<BusinessCalendar> | null;
}
export declare function resolveBusinessCalendar({ question, today, intent, previous, }: CalendarInput): BusinessCalendar;
/** Only an elliptical period change can inherit the former tools and their entity filters. */
export declare function isCalendarOnlyFollowup(question: string): boolean;
export {};
//# sourceMappingURL=aiBusinessCalendar.d.ts.map