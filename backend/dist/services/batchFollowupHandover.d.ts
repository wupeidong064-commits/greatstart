import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
type Actor = NonNullable<AuthRequest['user']>;
export type FollowupKind = 'lead' | 'experience';
export type FollowupAssignment = {
    kind: FollowupKind;
    resourceId: string;
    toUserId: string;
};
export type FollowupBatchInput = {
    fromUserId: string;
    assignments: FollowupAssignment[];
    notes: string;
    requestId?: string;
};
export declare function followupBatchInput(body: any, executing?: boolean): FollowupBatchInput;
export declare function remainingFollowupCounts(tx: Prisma.TransactionClient, actor: Actor, fromUserId: string): Promise<{
    leads: number;
    experiences: number;
    students: number;
    total: number;
}>;
export declare function planFollowupBatch(tx: Prisma.TransactionClient, actor: Actor, input: FollowupBatchInput): Promise<{
    from: {
        id: string;
        name: string;
    };
    records: Map<string, {
        name: string;
        contact: string;
        status: string;
        eligible: boolean;
        updatedAt: Date;
    }>;
    preview: {
        items: {
            reason?: string | undefined;
            name: string;
            contact: string;
            toUserName: string;
            status: "ready" | "unavailable";
            kind: FollowupKind;
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
export declare function executeFollowupBatch(tx: Prisma.TransactionClient, actor: Actor, input: FollowupBatchInput): Promise<string | number | true | Prisma.JsonObject | Prisma.JsonArray | {
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
        kind: FollowupKind;
        resourceId: string;
        toUserId: string;
        toUserName: string;
    }[];
}>;
export {};
//# sourceMappingURL=batchFollowupHandover.d.ts.map