import type { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { resolveScope } from './scope';
import { recallStudentWhere, teachingStudentWhere } from '../services/studentResponsibility';

export const studentAccess = (req: AuthRequest, options: { includeRecall?: boolean } = {}) => {
  const actor = req.user;
  const scope = resolveScope(req);
  if (!actor?.id || !scope.campusId) throw new ApiError('未分配校区', 403, 'FORBIDDEN');
  const campus = { organizationId: scope.organizationId, campusId: scope.campusId };
  const management = ['admin', 'manager'].includes(actor.role || '');
  const teacher = ['teacher', 'coach'].includes(actor.role || '');
  if (!management && !teacher && !['sales', 'staff'].includes(actor.role || ''))
    throw new ApiError('无权访问学员档案', 403, 'FORBIDDEN');
  const owned: Prisma.StudentWhereInput = management
    ? {}
    : teacher
      ? {
          OR: [
            teachingStudentWhere(campus, actor.id),
            ...(options.includeRecall ? [recallStudentWhere(campus, actor.id)] : []),
          ],
        }
      : { salesId: actor.id };
  return { actor, campus, management, teacher, where: { ...campus, ...(management ? {} : { status: { not: 'archived' } }), ...owned } as Prisma.StudentWhereInput };
};
