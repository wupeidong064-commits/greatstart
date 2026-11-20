import { Prisma } from '@prisma/client';
export declare function selectClassCourseType(tx: Prisma.TransactionClient, organizationId: string, value: unknown, currentType?: string): Promise<string>;
export declare function inheritClassCourse(tx: Prisma.TransactionClient, cls: {
    organizationId: string;
    courseType: string;
}): Promise<string>;
export declare function renameClassCourseType(tx: Prisma.TransactionClient, previous: {
    id: string;
    organizationId: string;
    name: string;
}, newName: string): Promise<void>;
//# sourceMappingURL=classCourseType.d.ts.map