import type { Response, NextFunction } from 'express';
import { type AuthRequest } from './auth';
export declare function authenticateIntegration(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=integrationAuth.d.ts.map