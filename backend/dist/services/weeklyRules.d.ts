/** 班级常规时间：按北京时间每周重复。不会写数据库或自动生成排课。 */
export interface WeeklyClassRule {
    weekday: number;
    startTime: string;
    endTime: string;
    classroom?: string | null;
}
export interface PreviewOccurrence {
    businessDate: string;
    weekday: number;
    startTime: Date;
    endTime: Date;
    classroom: string | null;
}
/** 验证及标准化常规规则；禁止一个班在同一天安排重叠时段。 */
export declare function normalizeWeeklyRules(input: WeeklyClassRule[]): WeeklyClassRule[];
/** 生成预览；提交和冲突检查由调用方在数据库事务中完成。 */
export declare function previewWeeklyOccurrences(input: WeeklyClassRule[], startDate: string, endDate: string): PreviewOccurrence[];
//# sourceMappingURL=weeklyRules.d.ts.map