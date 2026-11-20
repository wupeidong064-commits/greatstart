import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const lessonDeductionController: {
    /**
     * 检查班级在某天是否已划课（用于非管理员限制一天只能划一次）
     * GET /api/lesson-deductions/check/:classId?date=YYYY-MM-DD
     */
    checkDailyDeduction: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    /**
     * 创建划课记录（内部方法，供其他控制器调用）
     */
    createDeductionRecord: (classId: string, organizationId: string, operatorId: string, operatorName: string, deductionCount: number, deductionDate: string) => Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        classId: string;
        scheduleId: string | null;
        operatorId: string | null;
        operatorName: string | null;
        deductionDate: string;
        deductionCount: number;
    }>;
    /**
     * 获取班级的划课记录列表
     * GET /api/lesson-deductions/records/:classId?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
     */
    getClassDeductionRecords: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=lessonDeductionController.d.ts.map