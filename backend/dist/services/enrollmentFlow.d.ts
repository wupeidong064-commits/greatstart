import type { Enrollment } from '@prisma/client';
type Period = Pick<Enrollment, 'classId' | 'studentId' | 'status' | 'enrolledAt' | 'endedAt'>;
/** Merge overlapping membership periods per class/student without losing leave-and-return events. */
export declare function enrollmentFlow(rows: Period[], start: Date, end: Date, mergeAdjacent?: boolean): {
    historyAvailable: boolean;
    unknownPeriods: number;
    startCount: null;
    added: null;
    removedRoster: null;
    removedByStatus: null;
    removedTotal: null;
    endCount: null;
} | {
    historyAvailable: boolean;
    unknownPeriods: number;
    startCount: number;
    added: number;
    removedRoster: number;
    removedByStatus: number;
    removedTotal: number;
    endCount: number;
};
/** A class remains nonempty when one membership ends exactly as another begins. */
export declare function classEnrollmentFlow(rows: Period[], start: Date, end: Date): {
    historyAvailable: boolean;
    unknownPeriods: number;
    startCount: null;
    added: null;
    removedRoster: null;
    removedByStatus: null;
    removedTotal: null;
    endCount: null;
} | {
    historyAvailable: boolean;
    unknownPeriods: number;
    startCount: number;
    added: number;
    removedRoster: number;
    removedByStatus: number;
    removedTotal: number;
    endCount: number;
};
export {};
//# sourceMappingURL=enrollmentFlow.d.ts.map