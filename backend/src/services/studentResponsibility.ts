import type { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { resolveScope } from '../utils/scope';
import { lockEnrollmentStudent } from './enrollmentPeriod';

export type ResponsibilityScope = { organizationId: string; campusId: string };

/** Teaching responsibility is not attendance eligibility. Paused classes still
 * have a teacher and renewal obligations, but must not enter attendance stats. */
export function responsibilityEnrollmentWhere(scope: ResponsibilityScope, now = new Date(), teacherId?: string): Prisma.EnrollmentWhereInput {
  return { organizationId: scope.organizationId, status: 'active', enrolledAt: { lte: now },
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    class: { ...scope, status: { not: 'deleted' }, ...(teacherId ? { teacherId } : {}) } };
}

export function teachingStudentWhere(scope: ResponsibilityScope, teacherId: string, now = new Date()): Prisma.StudentWhereInput {
  return { ...scope, status: { not: 'archived' }, enrollments: { some: responsibilityEnrollmentWhere(scope, now, teacherId) } };
}

export const dormantStudentWhere = (): Prisma.StudentWhereInput => ({ status: { not: 'archived' }, OR: [{ status: 'lost' }, { renewalStatus: 'no_renewal' }] });

export function dormantResourceWhere(scope: ResponsibilityScope, now = new Date()): Prisma.StudentWhereInput {
  return { ...scope, status: { not: 'archived' }, OR: [
    { status: 'lost' }, { renewalStatus: 'no_renewal' },
    { status: 'active', recallTeacherId: { not: null }, enrollments: { none: responsibilityEnrollmentWhere(scope, now) } },
  ] };
}

/** A recalled learner stays visible until a real class takes over. This grants
 * profile follow-up only; never enrollment, attendance or renewal authority. */
export function recallStudentWhere(scope: ResponsibilityScope, teacherId: string, now = new Date()): Prisma.StudentWhereInput {
  return { ...scope, recallTeacherId: teacherId, status: { not: 'archived' }, OR: [
    { status: 'lost' }, { renewalStatus: 'no_renewal' },
    { status: 'active', enrollments: { none: responsibilityEnrollmentWhere(scope, now) } },
  ] };
}

export function renewalAccess(req: AuthRequest) {
  const actor = req.user, scope = resolveScope(req);
  if (!actor?.id || !scope.campusId) throw new ApiError('未分配校区', 403, 'FORBIDDEN');
  const campus = { organizationId: scope.organizationId, campusId: scope.campusId };
  const management = ['admin', 'manager'].includes(actor.role);
  const teacher = ['teacher', 'coach'].includes(actor.role);
  if (!management && !teacher) throw new ApiError('续费由负责班级老师或管理员办理', 403, 'FORBIDDEN');
  return { actor, campus, management, teacher,
    where: management ? campus as Prisma.StudentWhereInput : teachingStudentWhere(campus, actor.id) };
}

export async function uniqueResponsibleTeacher(tx: Prisma.TransactionClient, scope: ResponsibilityScope, studentId: string, actorId?: string): Promise<string | null> {
  const rows = await tx.enrollment.findMany({ where: { ...responsibilityEnrollmentWhere(scope), studentId },
    select: { class: { select: { teacherId: true, teacher: { select: { id: true, role: true, organizationId: true, campusId: true, isPlatformAdmin: true } } } } } });
  const ids = [...new Set(rows.flatMap(row => {
    const teacher = row.class.teacher;
    return teacher && !teacher.isPlatformAdmin && teacher.organizationId === scope.organizationId && teacher.campusId === scope.campusId && ['teacher', 'coach'].includes(teacher.role) ? [teacher.id] : [];
  }))];
  if (actorId && ids.includes(actorId)) return actorId;
  return ids.length === 1 ? ids[0] : null;
}

/** Called after ALL class owners in a batch changed. Multiple final teachers
 * stay unassigned instead of depending on the arbitrary class execution order. */
export async function lockHandoverRecallStudents(tx: Prisma.TransactionClient, scope: ResponsibilityScope, classIds: string[], formerTeacherId: string) {
  const students = await tx.student.findMany({ where: { ...scope, status: { not: 'archived' }, renewalStatus: 'no_renewal',
    AND: [{ OR: [{ recallTeacherId: null }, { recallTeacherId: formerTeacherId }] }],
    enrollments: { some: { ...responsibilityEnrollmentWhere(scope), classId: { in: classIds } } } }, select: { id: true }, orderBy: { id: 'asc' } });
  for (const student of students) await lockEnrollmentStudent(tx, student.id, scope);
  return students.map(student => student.id);
}

export async function syncHandoverRecallTeachers(tx: Prisma.TransactionClient, scope: ResponsibilityScope, studentIds: string[], formerTeacherId: string) {
  const students = await tx.student.findMany({ where: { ...scope, status: { not: 'archived' }, renewalStatus: 'no_renewal',
    id: { in: studentIds },
    AND: [{ OR: [{ recallTeacherId: null }, { recallTeacherId: formerTeacherId }] }],
  }, select: { id: true, recallTeacherId: true } });
  for (const student of students) {
    const recallTeacherId = await uniqueResponsibleTeacher(tx, scope, student.id);
    await tx.student.updateMany({ where: { ...scope, id: student.id, recallTeacherId: student.recallTeacherId, renewalStatus: 'no_renewal', status: { not: 'archived' } }, data: { recallTeacherId } });
  }
}
