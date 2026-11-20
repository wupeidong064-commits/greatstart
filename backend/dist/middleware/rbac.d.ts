import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
export type Role = 'admin' | 'manager' | 'teacher' | 'coach' | 'sales' | 'staff' | 'parent';
export declare const normalizeRole: (role: string) => Role;
export declare const requireRole: (...allowedRoles: Role[]) => (req: AuthRequest, _res: Response, next: NextFunction) => void;
export declare const requireMinRole: (minRole: Role) => (req: AuthRequest, _res: Response, next: NextFunction) => void;
export declare const requireOrganizationAccess: () => (req: AuthRequest, _res: Response, next: NextFunction) => Promise<void>;
export declare const platformOnly: (req: AuthRequest, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=rbac.d.ts.map