import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const experienceLessonController: {
    getExperienceLessons: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getAvailableSchedules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getExperienceLessonById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createExperienceLesson: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateExperienceLesson: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateStatus: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteExperienceLesson: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getConversionCandidates: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getUnconverted: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getTeacherConversionStats: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=experienceLessonController.d.ts.map