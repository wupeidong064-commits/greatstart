import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const leadController: {
    getLeads: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getLeadById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createLead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateLead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateLastContactTime: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteLead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=leadController.d.ts.map