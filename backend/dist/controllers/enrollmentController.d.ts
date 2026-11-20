import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const enrollmentController: {
    getEnrollments: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getEnrollmentById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createEnrollment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateEnrollment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    removeAsLost: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteEnrollment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    transferStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=enrollmentController.d.ts.map