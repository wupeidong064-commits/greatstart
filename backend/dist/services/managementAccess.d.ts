import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth';
export declare const managementLevels: readonly ["none", "manager", "super"];
export type ManagementLevel = typeof managementLevels[number];
type Identity = {
    role: string;
    managementLevel?: string;
    isPlatformAdmin?: boolean;
};
export declare const jobRole: (user: Identity) => string | null;
export declare function effectiveRole(user: Identity): string;
export declare const sessionUser: <T extends Identity>(user: T) => T & {
    jobRole: string | null;
    role: string;
};
export declare const staffUser: <T extends Identity>(user: T) => Omit<T & {
    password?: string;
}, "password"> & {
    jobRole: string | null;
    role: string;
};
export declare const managementError: (message: string, code?: string) => ApiError;
export declare function assertEditableAccount(actor: NonNullable<AuthRequest['user']>, target: Identity & {
    id: string;
}, disabling?: boolean): void;
export declare function lockManagement(tx: Prisma.TransactionClient, organizationId: string): Promise<void>;
export declare function changeManagement(actor: NonNullable<AuthRequest['user']>, organizationId: string, userId: string, level: unknown, expectedLevel: unknown): Promise<Omit<{
    password: string;
    role: string;
    managementLevel: string;
    isPlatformAdmin: boolean;
    id: string;
    email: string | null;
    name: string;
    phone: string | null;
    organizationId: string | null;
    campusId: string | null;
    isActive: boolean;
    managementGrantedById: string | null;
    managementGrantedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
} & {
    password?: string;
}, "password"> & {
    jobRole: string | null;
    role: string;
}>;
export {};
//# sourceMappingURL=managementAccess.d.ts.map