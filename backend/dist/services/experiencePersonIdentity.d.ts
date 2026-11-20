import { Prisma } from '@prisma/client';
export declare const duplicateExperienceMessage = "\u8BE5\u5B66\u5458\u5DF2\u6709\u4F53\u9A8C\u767B\u8BB0\uFF0C\u8BF7\u5728\u539F\u8BB0\u5F55\u4E2D\u7EE7\u7EED\u8DDF\u8FDB\u3002\u5982\u65E0\u6743\u67E5\u770B\uFF0C\u8BF7\u8054\u7CFB\u6821\u533A\u8D1F\u8D23\u4EBA\u3002";
type PersonFields = {
    studentName: unknown;
    contact: unknown;
};
type StoredPerson = {
    id: string;
    studentName: string;
    contact: string;
};
export declare function experiencePerson(fields: PersonFields): {
    name: string;
    contact: string;
};
export declare function experiencePersonKey(fields: PersonFields): string;
export declare function existingPersonKeys(db: Pick<Prisma.TransactionClient, '$queryRaw'>, organizationId: string, names: string[], excludeId?: string): Promise<Set<string>>;
export declare function assertExperiencePersonAvailable(tx: Prisma.TransactionClient, organizationId: string, next: PersonFields, current?: StoredPerson): Promise<void>;
export {};
//# sourceMappingURL=experiencePersonIdentity.d.ts.map