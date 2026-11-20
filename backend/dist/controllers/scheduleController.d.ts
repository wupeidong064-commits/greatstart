import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const scheduleController: {
    getSchedules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getScheduleById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /** Actual-occurrence roster, including saved attendance. A substitute owns this occurrence, not the entire class. */
    getScheduleRoster: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /** Minimal, occurrence-authorized search; never creates an enrollment. */
    searchTemporaryStudents: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createSchedule: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateSchedule: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteSchedule: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    reschedule: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createRecurringSchedules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /** Replace the class rule and future occurrences as a single operation. */
    replaceRecurringSchedules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    cancelByClass: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    cancelAllFuture: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /** 按班级时间规则预览未来场次：只读，不写任何数据。 */
    previewFromClassRules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /** 按班级时间规则一次事务生成实际课表：任一场次冲突整批回滚；requestId 幂等防重复生成。 */
    generateFromClassRules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /** 按班级时间停/复某一个时段（2026-11-07 用户拍板）：只作用于该班未来场次，班级整体状态不动。
     *  pause：未开始的该时段场次 → class_paused（有考勤/课时记录的跳过保留）；resume：逐场冲突校验后恢复 scheduled。 */
    setClassRuleSlotStatus: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=scheduleController.d.ts.map