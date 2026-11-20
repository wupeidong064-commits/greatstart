import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const statisticsController: {
    getStudentStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getAttendanceStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getCourseStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getFinanceStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getDashboard: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getWeeklySummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getConsumptionStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getMonthlySummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=statisticsController.d.ts.map