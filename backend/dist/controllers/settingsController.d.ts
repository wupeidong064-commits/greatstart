import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const settingsController: {
    getSetting: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateSetting: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=settingsController.d.ts.map