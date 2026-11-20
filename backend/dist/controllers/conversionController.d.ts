import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const conversionController: {
    getConversions: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getConversionSummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getVoidedConversions: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getConversionById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateConversion: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getRegistrationSchedules: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createConversion: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    renewStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteConversion: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    voidConversion: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    linkStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=conversionController.d.ts.map