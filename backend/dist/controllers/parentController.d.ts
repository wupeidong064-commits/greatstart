import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const parentController: {
    getLinkedStudents: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>;
    getStudentSchedules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>;
    getStudentAttendances: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>;
    getStudentPayments: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>;
    getStudentLessonLogs: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>;
    getStudentNotices: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>;
};
//# sourceMappingURL=parentController.d.ts.map