import { Prisma } from '@prisma/client';
import { assertScheduleAvailable } from './scheduleConflicts';
import { WeeklyClassRule, PreviewOccurrence } from './weeklyRules';
export declare const CLASS_RULES_GROUP_PREFIX = "classrules-v1";
export type ClassRulesRequest = {
    classId: string;
    startDate: string;
    endDate: string;
};
export type SelectedRule = {
    weekday: number;
    startTime: string;
    endTime: string;
};
/** 预览与生成共用的日期/参数校验。 */
export declare function validateClassRulesRequest(body: {
    classId?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    selectedRules?: unknown;
}): ClassRulesRequest & {
    selectedRules?: SelectedRule[];
};
/** 将所选时段对齐到班级规则子集；任何一项对不上即拒绝。 */
export declare function filterSelectedRules(rules: WeeklyClassRule[], selected: SelectedRule[] | undefined): WeeklyClassRule[];
/** 与生成同一套口径：按规则展开日期范围，并只保留未来场次。 */
export declare function selectUpcomingOccurrences(rules: WeeklyClassRule[], startDate: string, endDate: string): {
    occurrences: PreviewOccurrence[];
    skippedPast: number;
};
type ConflictClass = {
    id: string;
    campusId: string | null;
    teacherId: string | null;
};
/** 只读冲突标注：供确认前提示；生成事务内仍由 assertScheduleAvailable 逐一复核。 */
export declare function annotateConflicts(tx: Prisma.TransactionClient, organizationId: string, classData: ConflictClass, occurrences: PreviewOccurrence[]): Promise<{
    businessDate: string;
    startTime: string;
    kind: string;
    withName: string;
}[]>;
/** 幂等组标识：同一 requestId + 同一意图 = 同一批场次。 */
export declare function classRulesGroupId(requestId: string, payload: unknown): string;
/** 在生成事务内读取班级时间规则并产出待写场次；调用方持有机构课表锁。 */
export declare function buildClassRuleSlots(tx: Prisma.TransactionClient, classId: string, startDate: string, endDate: string, selectedRules?: SelectedRule[]): Promise<{
    rules: WeeklyClassRule[];
    slots: PreviewOccurrence[];
    skippedPast: number;
}>;
export { assertScheduleAvailable };
//# sourceMappingURL=classRulesGeneration.d.ts.map