import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const campusController: {
    getCampuses: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getCampusById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createCampus: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateCampus: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteCampus: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=campusController.d.ts.map