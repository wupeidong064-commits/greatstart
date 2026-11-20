import { AuthRequest } from '../middleware/auth';
export interface RequestScope {
    organizationId: string;
    campusId: string | null;
}
export declare function resolveScope(req: AuthRequest): RequestScope;
export declare function campusWhere(scope: RequestScope): {
    campusId?: string;
};
//# sourceMappingURL=scope.d.ts.map