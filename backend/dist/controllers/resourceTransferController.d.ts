import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const resourceTransferController: {
    getDormantCandidates: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getDormantResources: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    previewDormantBatch: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    executeDormantBatch: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    previewFollowupBatch: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    executeFollowupBatch: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    previewBatch: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    executeBatch: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getFollowupCandidates: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getFollowupResources: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    executeFollowup: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getTeacherResources: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getCandidates: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    previewTransfer: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    executeTransfer: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getTransferHistory: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getTransferById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=resourceTransferController.d.ts.map