import { Prisma } from '@prisma/client';
/** 体验课无独立校区字段，关联班级优先，未分班时使用负责员工校区。 */
export declare function experienceScopeWhere(organizationId: string | undefined, campusId?: string | null): Prisma.ExperienceLessonWhereInput;
//# sourceMappingURL=experienceScope.d.ts.map