import { Prisma } from '@prisma/client';
import { WeeklyClassRule } from './weeklyRules';
/** 读取并规范化某班的班级时间规则；无规则返回空数组。 */
export declare function readClassWeeklyRules(tx: Prisma.TransactionClient, classId: string): Promise<WeeklyClassRule[]>;
/**
 * 全量替换班级时间规则。input === undefined 表示本次不改；null 或 [] 表示清空。
 * 只写规则表，从不读写 schedules —— 修改规则不会静默改变任何已有场次。
 * 调用方需持有机构课表锁（lockScheduleWrites）以串行化同班并发保存。
 */
export declare function replaceClassWeeklyRules(tx: Prisma.TransactionClient, organizationId: string, classId: string, input: unknown): Promise<void>;
/** 机构内唯一班级代码，服务端生成；调用方持有机构课表锁，同机构建班互斥。 */
export declare function generateClassCode(tx: Prisma.TransactionClient, organizationId: string): Promise<string>;
//# sourceMappingURL=classWeeklyRuleStore.d.ts.map