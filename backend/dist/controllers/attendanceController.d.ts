import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const attendanceController: {
    getAttendances: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getAttendanceById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    batchCheckIn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getContinuousLeaveStudents: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getHoneymoonAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getLowAttendanceClasses: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getClassAttendanceStats: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getClassAttendanceSessions: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getLowAttendanceStudents: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=attendanceController.d.ts.map