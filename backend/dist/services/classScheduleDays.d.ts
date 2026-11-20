/** Class names and old generation rules are not evidence of an upcoming lesson. */
export declare function withUpcomingScheduleDays<T extends {
    id: string;
}>(classes: T[], organizationId: string): Promise<(T & {
    scheduleWeekDays: number[];
})[]>;
//# sourceMappingURL=classScheduleDays.d.ts.map