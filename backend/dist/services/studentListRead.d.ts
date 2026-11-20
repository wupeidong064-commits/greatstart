import { Prisma } from '@prisma/client';
export declare const renewalCourseTypes: string[];
export declare const confirmedRenewals: (organizationId: string) => Prisma.ConversionWhereInput;
/** Date selection refers to the latest confirmed renewal, not any historical order. */
export declare function latestRenewalFilter(query: Record<string, unknown>, organizationId: string): Prisma.StudentWhereInput;
export declare function recallableFromNotes(notes: string | null, now?: Date): boolean;
//# sourceMappingURL=studentListRead.d.ts.map