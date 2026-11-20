import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const consumptionController: {
    getStatistics: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getClassStudentChanges: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=consumptionController.d.ts.map