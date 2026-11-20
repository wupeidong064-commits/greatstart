import type { AiIntent } from './aiIntent';
import type { BusinessCalendar } from './aiBusinessCalendar';
import type { OperatingSnapshot } from './aiOperatingFacts';
declare const actions: {
    readonly compensation: {
        readonly workload: "把固定岗位职责、实际授课和招生协作分开。固定部分覆盖备课、教研和家校沟通，授课部分按已完成课次核算，代课计给实际授课人。";
        readonly attribution: "先约定续费归属和协作分配，再核算激励。对交接班、多人跟进和退费分别列例，请老师用同一份规则复算。";
        readonly trial: "先拿一个完整月份做新旧方案并行试算。逐人列出固定收入、授课报酬、激励和总额，请负责人核对差额及校区总预算，再确定比例。";
    };
    readonly teacher: {
        readonly attendance: "把实际授课、应到和实到列入个人目标表。按班查看未到原因，记录回访结果，每周复核同一口径的实到和应到。";
        readonly renewal: "月初列出本月到期且由本人负责跟进的学员，逐一确认续费意向。先核实到期分母和销售归属，再议定个人续费率目标。";
        readonly review: "月末按实际授课人复核已完成场次，代课与交接单列。负责人和老师一起核对目标表，记录哪些差异来自排课变化。";
    };
    readonly sales: {
        readonly funnel: "把待跟进、已约体验、实际到场和已确认成单分开。选一个环节明确负责人、下一次联系时间和复核日期。";
        readonly renewal: "先列出期间内到期的学员并确认跟进归属，再用同一批学员核算续费率。逐项复核未联系和已联系待确认的记录。";
    };
    readonly attendance: {
        readonly followup: "按班列出需跟进的学员，向授课老师核实请假、调课和缺席原因。记录下次到课安排，在下一次已完成场次后复核。";
        readonly roster: "对照每场有效报名、代课和串课记录复核应到人次，再与签到明细核对实到。班级人数与课次人次分开记录。";
    };
    readonly operations: {
        readonly owner: "选定要改善的一项业务指标，指定负责人，把本期基线、拟采取的行动和复核日期记在同一张表上。";
        readonly review: "在下一个可比期间按相同范围复核结果，分别记录执行情况、人员变动及仍需核实的原因。";
    };
};
export declare const adviceActionCatalog: string;
export type AdviceTopic = keyof typeof actions;
export declare function adviceTopic(intent: AiIntent, question: string, previous?: AdviceTopic): AdviceTopic | undefined;
export declare function renderOperatingAdvice(topic: AdviceTopic, ids: string[], calendar: BusinessCalendar, snapshot: OperatingSnapshot): string;
export {};
//# sourceMappingURL=aiOperatingAdvice.d.ts.map