import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const studentController: {
    getStudents: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getStudentById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    archiveStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    restoreStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=studentController.d.ts.map