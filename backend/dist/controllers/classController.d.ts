import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const classController: {
    getClasses: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getClassById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createClass: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateClass: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteClass: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getExperiencePriorityClasses: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getClassStudents: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=classController.d.ts.map