import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const userController: {
    getUsers: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getUserById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createUser: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateUser: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    resetStaffPassword: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteUser: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    changeManagement: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getTeachers: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getCoachStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getSalesStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=userController.d.ts.map