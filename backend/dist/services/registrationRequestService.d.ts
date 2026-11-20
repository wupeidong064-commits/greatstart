import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
export declare const registrationRoles: string[];
export declare function registrationActor(req: AuthRequest): {
    id: string;
    role: string;
    organizationId: string;
    campusId: string;
};
export type RegistrationActor = ReturnType<typeof registrationActor>;
export declare const managesRegistrations: (actor: RegistrationActor) => boolean;
export declare function requestKey(req: AuthRequest): string | undefined;
export declare function runRegistration<T extends {
    id: string;
}>(options: {
    actor: RegistrationActor;
    operation: 'lead' | 'experience' | 'conversion';
    key?: string;
    command: object;
    authorizeReplay: (tx: Prisma.TransactionClient, id: string) => Promise<void>;
    create: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<{
    data: T;
    status: "legacy";
} | {
    data: Prisma.JsonValue;
    status: "replayed";
} | {
    data: T;
    status: "created";
}>;
export declare function textValue(value: unknown, label: string, required?: boolean): string | null;
export declare function scopedStaff(tx: Prisma.TransactionClient, actor: RegistrationActor, id: string, teacher?: boolean): Promise<{
    id: string;
    name: string;
}>;
export declare function accessibleLead(tx: Prisma.TransactionClient, actor: RegistrationActor, id: string): Promise<void>;
//# sourceMappingURL=registrationRequestService.d.ts.map