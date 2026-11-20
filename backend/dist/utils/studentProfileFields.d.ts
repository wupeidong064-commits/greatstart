/** A registration age is a snapshot; it must never be converted into a birthday. */
export declare function validateRecordedAge(value: unknown): number | null;
/** Accept date-only and ISO timestamps while rejecting impossible calendar dates. */
export declare function parseProfileDate(value: unknown): Date | null;
export declare function validateAddress(value: unknown): string | null;
export declare function studentGenderFromConversion(value: unknown): string | null;
/** Only a valid mainland mobile can be used as parent login phone; landlines and international contacts stay in the profile. */
export declare function parentMobileFromContact(value: unknown): string | null;
/** Student profile names are bounded on every write path. */
export declare function validateStudentName(value: unknown): string;
/** Validate the complete number against country numbering plans; retain the entered formatting. */
export declare function validateContactPhone(value: unknown): string | null;
export declare function validateBusinessDate(value: string, label: string, now?: Date): string;
//# sourceMappingURL=studentProfileFields.d.ts.map