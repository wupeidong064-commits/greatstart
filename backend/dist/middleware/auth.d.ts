import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    authSession?: {
        tokenHash: string;
        expiresAt: Date;
    };
    user?: {
        id: string;
        email: string | null;
        role: string;
        organizationId?: string;
        campusId?: string;
        phone?: string;
        isPlatformAdmin?: boolean;
        managementLevel?: string;
        jobRole?: string | null;
    };
}
export declare const sessionTag: (passwordHash: string) => string;
export declare const authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.d.ts.map