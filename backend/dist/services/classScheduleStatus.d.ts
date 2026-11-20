import { Prisma } from '@prisma/client';
/** Caller holds the institution timetable lock. Lock occurrences in ID order
 * before changing the class row, matching attendance's occurrence -> class order. */
export declare function syncClassScheduleStatus(tx: Prisma.TransactionClient, cls: {
    id: string;
    status: string;
    organizationId: string;
    campusId: string | null;
}, nextStatus: string): Promise<void>;
//# sourceMappingURL=classScheduleStatus.d.ts.map