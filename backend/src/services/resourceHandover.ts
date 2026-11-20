import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { effectiveRole, lockManagement } from './managementAccess';
import { CLASS_PAUSED, hiddenTimetableOccurrence, lockScheduleWrites } from './scheduleConflicts';
import { syncClassScheduleStatus } from './classScheduleStatus';
import { lockHandoverRecallStudents, syncHandoverRecallTeachers } from './studentResponsibility';

// Job roles are independent of institutional management authority.
export const teachingRoles = ['teacher', 'coach'];
export const sourceRoles = [...teachingRoles, 'staff', 'sales', 'super_admin'];
export type HandoverInput = { fromTeacherId: string; toTeacherId: string; classIds?: string[]; notes?: string };

export function handoverInput(body: any): HandoverInput {
  const { fromTeacherId, toTeacherId, classIds, notes } = body;
  if (typeof fromTeacherId !== 'string' || !fromTeacherId || typeof toTeacherId !== 'string' || !toTeacherId || fromTeacherId === toTeacherId ||
      (classIds !== undefined && (!Array.isArray(classIds) || !classIds.length || classIds.length > 1000 || classIds.some((id: any) => typeof id !== 'string' || !id) || new Set(classIds).size !== classIds.length)) ||
      (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)))
    throw new ApiError('请选择不同的交接老师及至少一个班级，备注不超过2000字', 400, 'INVALID_PARAMS');
  // Omitted classIds retains the legacy all-classes contract; [] must never mean all.
  return { fromTeacherId, toTeacherId, classIds, notes };
}

/** Same lock order as staff deactivation. Recheck authority after waiting. */
export async function lockHandover(tx: Prisma.TransactionClient, actor: NonNullable<AuthRequest['user']>) {
  await lockManagement(tx, actor.organizationId!);
  await lockScheduleWrites(tx, actor.organizationId!);
  const current = await tx.user.findUnique({ where: { id: actor.id } });
  if (!current?.isActive || current.isPlatformAdmin || current.organizationId !== actor.organizationId || current.campusId !== actor.campusId || effectiveRole(current) !== 'manager')
    throw new ApiError('管理权限已变化，请刷新后重试', 403, 'FORBIDDEN');
  return current;
}

export async function planHandover(tx: Prisma.TransactionClient, actor: NonNullable<AuthRequest['user']>, input: HandoverInput, now = new Date()) {
  const scope = { organizationId: actor.organizationId!, campusId: actor.campusId! };
  const from = await tx.user.findFirst({ where: { ...scope, id: input.fromTeacherId, isPlatformAdmin: false, role: { in: teachingRoles } } });
  const to = await tx.user.findFirst({ where: { ...scope, id: input.toTeacherId, isActive: true, isPlatformAdmin: false, role: { in: teachingRoles } } });
  if (!from || !to) throw new ApiError('请选择本机构待交接人员和在职接课老师', 403, 'TEACHER_UNAVAILABLE');
  const classes = await tx.class.findMany({ where: { ...scope, teacherId: from.id, status: { not: 'deleted' }, ...(input.classIds ? { id: { in: input.classIds } } : {}) }, select: { id: true, name: true, status: true, organizationId: true, campusId: true }, orderBy: { id: 'asc' } });
  if (input.classIds && classes.length !== input.classIds.length) throw new ApiError('所选班级已交接或不属于该老师，请刷新资源后重试', 409, 'RESOURCE_CHANGED');
  if (!classes.length) throw new ApiError('该老师已没有待交接班级，请刷新列表', 409, 'NO_TRANSFER_RESOURCES');
  const ids = classes.map(cls => cls.id);
  const pendingWhere = { ...scope, classId: { in: ids }, teacherId: from.id, startTime: { gt: now }, status: { in: ['scheduled', CLASS_PAUSED] } };
  const initial = await tx.schedule.findMany({ where: pendingWhere, select: { id: true }, orderBy: { id: 'asc' } });
  for (const item of initial) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${item.id}))`;
  // A concurrent check-in may have completed an occurrence while we waited.
  const pending = await tx.schedule.findMany({ where: { ...pendingWhere, id: { in: initial.map(item => item.id) } }, include: { class: { select: { name: true, status: true } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] });
  const visible = pending.filter(row => row.status === 'scheduled' && row.class.status !== 'inactive');
  const existing = visible.length ? await tx.schedule.findMany({ where: { organizationId: scope.organizationId, teacherId: to.id, status: { notIn: ['cancelled', 'rescheduled'] }, NOT: hiddenTimetableOccurrence(), startTime: { lt: new Date(Math.max(...visible.map(row => +row.endTime))) }, endTime: { gt: new Date(Math.min(...visible.map(row => +row.startTime))) } }, include: { class: { select: { name: true } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] }) : [];
  const conflicts: { className: string; startTime: Date; endTime: Date; conflictingClassName: string; conflictingStartTime: Date; conflictingEndTime: Date }[] = [];
  // Only teacher ownership changes. Do not reject old, unchanged room/class overlaps.
  for (let i = 0; i < visible.length; i++) {
    const row = visible[i];
    for (const other of [...existing, ...visible.slice(0, i)]) {
      if (row.startTime < other.endTime && row.endTime > other.startTime) conflicts.push({ className: row.class.name, startTime: row.startTime, endTime: row.endTime, conflictingClassName: other.campusId === scope.campusId ? other.class.name : '其他校区班级', conflictingStartTime: other.startTime, conflictingEndTime: other.endTime });
    }
  }
  const details = { classes: ids, schedules: pending.map(row => row.id), classCount: ids.length, scheduleCount: pending.length, studentCount: await tx.enrollment.count({ where: { organizationId: scope.organizationId, classId: { in: ids }, status: 'active' } }) };
  return { from, to, classes, pending, conflicts, details };
}

const localTime = (date: Date) => date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export function assertHandoverAvailable(plan: Awaited<ReturnType<typeof planHandover>>) {
  const first = plan.conflicts[0];
  if (first) throw new ApiError(`无法交接：${plan.to.name}在北京时间 ${localTime(first.startTime)} 至 ${localTime(first.endTime)}，接手「${first.className}」会与「${first.conflictingClassName}」冲突。请调整勾选班级或先调课。`, 409, 'SCHEDULE_CONFLICT');
}

export async function applyHandover(tx: Prisma.TransactionClient, plan: Awaited<ReturnType<typeof planHandover>>, deferRecallSync = false) {
  for (const cls of plan.classes) if (cls.status === 'inactive') await syncClassScheduleStatus(tx, cls, 'inactive');
  const scope={organizationId:plan.classes[0].organizationId,campusId:plan.classes[0].campusId!};
  const recallStudents=deferRecallSync?[]:await lockHandoverRecallStudents(tx,scope,plan.details.classes,plan.from.id);
  // Future substitutes remain their own teachers; completed and historical rows never change.
  await tx.schedule.updateMany({ where: { id: { in: plan.pending.map(row => row.id) }, teacherId: plan.from.id, status: { in: ['scheduled', CLASS_PAUSED] } }, data: { teacherId: plan.to.id } });
  await tx.class.updateMany({ where: { id: { in: plan.details.classes }, teacherId: plan.from.id }, data: { teacherId: plan.to.id } });
  if(!deferRecallSync) await syncHandoverRecallTeachers(tx,scope,recallStudents,plan.from.id);
}
