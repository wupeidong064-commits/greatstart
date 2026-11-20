import type { Evidence, ToolContext } from './aiTools';
export declare function operationalRange(ctx: ToolContext, params: Record<string, unknown>, days?: number): {
    start: string;
    end: string;
    from: Date;
    to: Date;
};
/** 完成场次按课程日期归集，保留同一学员在不同班级的记录。 */
export declare function attendanceFollowup(ctx: ToolContext, params: Record<string, unknown>, byClass: boolean): Promise<Evidence>;
/** 尚无独立校区字段时，按关联班级或无班记录的负责员工校区归属，不扩大至机构全部。 */
export declare function experienceOverview(ctx: ToolContext, params: Record<string, unknown>): Promise<Evidence>;
/** 班级学员变化监测：与课消收入总结页「班级学员变化监测」同口径；期初/流失/净变化证据不足时留空，不当作 0。 */
export declare function classStudentChanges(ctx: ToolContext, params: Record<string, unknown>): Promise<Evidence>;
export declare function teacherPerformance(ctx: ToolContext, params: Record<string, unknown>): Promise<Evidence>;
export declare function studentAttendance(ctx: ToolContext, params: Record<string, unknown>): Promise<Evidence>;
//# sourceMappingURL=aiOperationalData.d.ts.map