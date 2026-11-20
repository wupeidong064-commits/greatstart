import { RequestHandler, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const avatarUpload: RequestHandler;
export declare const accountAvatarController: {
    get: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    save: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    remove: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=accountAvatarController.d.ts.map