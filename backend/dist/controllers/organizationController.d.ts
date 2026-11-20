import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const organizationController: {
    getOrganizations: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getOrganizationById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createOrganization: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updateOrganization: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deleteOrganization: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=organizationController.d.ts.map