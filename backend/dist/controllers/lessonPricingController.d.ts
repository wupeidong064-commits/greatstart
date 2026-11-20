import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const lessonPricingController: {
    get(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    confirm(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
};
//# sourceMappingURL=lessonPricingController.d.ts.map