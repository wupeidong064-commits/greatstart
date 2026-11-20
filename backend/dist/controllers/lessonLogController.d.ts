import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const lessonLogController: {
    getBalance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getLessonLogs: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createLessonLog: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    addLessons: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deductLessons: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    activityDeduct: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=lessonLogController.d.ts.map