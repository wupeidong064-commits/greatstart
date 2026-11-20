import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';

/** 体验课无独立校区字段，关联班级优先，未分班时使用负责员工校区。 */
export function experienceScopeWhere(organizationId: string | undefined, campusId?: string | null): Prisma.ExperienceLessonWhereInput {
  if (!organizationId) throw new ApiError('未分配机构', 403, 'FORBIDDEN');
  return { organizationId, ...(campusId ? { OR: [
    { class: { campusId, organizationId } },
    { classId: null, assignee: { campusId, organizationId } },
  ] } : {}) };
}
