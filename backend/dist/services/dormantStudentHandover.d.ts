import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
type Actor = NonNullable<AuthRequest['user']>;
type Assignment = {
    kind: 'student';
    resourceId: string;
    toUserId: string;
};
export type DormantInput = {
    fromUserId: string;
    assignments: Assignment[];
    notes: string;
    requestId?: string;
};
export declare const UNASSIGNED_RECALL = "unassigned";
export declare function dormantInput(body: any, executing?: boolean): DormantInput;
export declare function recallSource(tx: Prisma.TransactionClient, actor: Actor, id: string): Promise<{
    id: string;
    name: string;
}>;
export declare function dormantCounts(tx: Prisma.TransactionClient, actor: Actor, source: string): Promise<{
    leads: number;
    experiences: number;
    students: number;
    total: number;
}>;
export declare function dormantCandidates(tx: Prisma.TransactionClient, actor: Actor): Promise<{
    sources: {
        studentCount: number;
        role: string;
        id: string;
        name: string;
        isActive: boolean;
    }[];
    recipients: {
        studentCount: number;
        role: string;
        id: string;
        name: string;
        isActive: boolean;
    }[];
    inactiveSources: {
        studentCount: number;
        role: string;
        id: string;
        name: string;
        isActive: boolean;
    }[];
    unassignedCount: number;
}>;
export declare function dormantResources(tx: Prisma.TransactionClient, actor: Actor, source: string): Promise<{
    leads: never[];
    experiences: never[];
    students: {
        phone: string | null;
        resourceLabel: string;
        ownerName: string;
        sourceClasses: string[];
        id: string;
        name: string;
        parentPhone: string | null;
        status: string;
        renewalStatus: string | null;
        recallTeacher: {
            id: string;
            name: string;
        } | null;
    }[];
}>;
export declare function planDormantBatch(tx: Prisma.TransactionClient, actor: Actor, input: DormantInput): Promise<{
    from: {
        id: string;
        name: string;
    };
    records: Map<string, {
        id: string;
        name: string;
        phone: string | null;
        updatedAt: Date;
        parentPhone: string | null;
    }>;
    preview: {
        items: {
            reason?: string | undefined;
            name: string;
            contact: string;
            toUserName: string;
            status: "ready" | "unavailable";
            kind: "student";
            resourceId: string;
            toUserId: string;
        }[];
        readyCount: number;
        unavailableCount: number;
        remainingCounts: {
            leads: number;
            experiences: number;
            students: number;
            total: number;
        };
    };
}>;
export declare function executeDormantBatch(tx: Prisma.TransactionClient, actor: Actor, input: DormantInput): Promise<string | number | true | Prisma.JsonObject | Prisma.JsonArray | {
    batchId: `${string}-${string}-${string}-${string}-${string}`;
    details: {
        leadCount: number;
        experienceCount: number;
        studentCount: number;
        total: number;
    };
    remainingCounts: {
        leads: number;
        experiences: number;
        students: number;
        total: number;
    };
    transfers: {
        kind: "student";
        resourceId: string;
        toUserId: string;
        toUserName: string;
    }[];
}>;
export {};
//# sourceMappingURL=dormantStudentHandover.d.ts.map