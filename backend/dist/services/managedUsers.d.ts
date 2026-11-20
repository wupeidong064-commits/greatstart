import { AuthRequest } from '../middleware/auth';
export declare const userFields: {
    readonly id: true;
    readonly name: true;
    readonly email: true;
    readonly role: true;
    readonly phone: true;
    readonly campusId: true;
    readonly organizationId: true;
    readonly isActive: true;
    readonly createdAt: true;
    readonly updatedAt: true;
    readonly isPlatformAdmin: true;
    readonly managementLevel: true;
    readonly managementGrantedById: true;
    readonly managementGrantedAt: true;
};
export declare const employeeRoles: string[];
export declare const fail: (message: string, status?: number) => never;
export declare function textField(v: unknown, label: string, max?: number): string;
export declare function validEmail(v: unknown): string;
export declare function normalizePhone(v: unknown): string;
export declare function loginIdentity(body: {
    email?: unknown;
    phone?: unknown;
}): {
    email: string | null;
    phone: string | null;
};
export declare function validPassword(v: unknown): string;
export declare function staffScope(req: AuthRequest): {
    isPlatformAdmin: boolean;
    campusId?: string | undefined;
    organizationId: string;
};
export declare function createManaged(req: AuthRequest, role: string): Promise<{
    accountReused: boolean;
    role: string;
    managementLevel: string;
    id: string;
    email: string | null;
    name: string;
    phone: string | null;
    organizationId: string | null;
    campusId: string | null;
    isActive: boolean;
    managementGrantedById: string | null;
    managementGrantedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
} | {
    defaultPassword: string;
    accountReused: boolean;
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
    createdAt: Date;
    updatedAt: Date;
}>;
//# sourceMappingURL=managedUsers.d.ts.map