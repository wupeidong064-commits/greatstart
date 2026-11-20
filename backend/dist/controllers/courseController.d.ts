import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const courseController: {
    getCourses: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getCourseById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createCourse: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateCourse: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteCourse: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=courseController.d.ts.map