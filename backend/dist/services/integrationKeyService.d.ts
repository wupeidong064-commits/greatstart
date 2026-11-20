import { type AuthRequest } from '../middleware/auth';
export declare const hashIntegrationKey: (key: string) => string;
export declare function integrationKeyStatus(organizationId: string): Promise<{
    revision: string;
    status: string;
    keyPrefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
} | {
    revision: null;
    status: string;
    keyPrefix: null;
    createdAt: null;
    lastUsedAt: null;
}>;
export declare function changeIntegrationKey(actor: NonNullable<AuthRequest['user']>, expectedRevision: string | null, revoke?: boolean): Promise<{
    revision: string;
    status: string;
    keyPrefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
} | {
    revision: null;
    status: string;
    keyPrefix: null;
    createdAt: null;
    lastUsedAt: null;
} | {
    plaintext: string;
    revision: string;
    status: string;
    keyPrefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
}>;
export declare function authenticateIntegrationKey(plaintext: string): Promise<{
    id: string;
    email: string | null;
    organizationId: string;
    campusId: string;
    role: string;
    managementLevel: string;
    isPlatformAdmin: boolean;
}>;
//# sourceMappingURL=integrationKeyService.d.ts.map