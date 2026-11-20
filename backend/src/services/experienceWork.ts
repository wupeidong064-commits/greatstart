import { Prisma } from '@prisma/client';
import { experienceScopeWhere } from '../utils/experienceScope';
import { hiddenTimetableOccurrence } from './scheduleConflicts';

type Actor = { userId: string; organizationId: string; campusId: string; role: string };
export const experienceWorkSelect = {
  id: true, studentName: true, scheduleDate: true, status: true, updatedAt: true,
  startTime: true, endTime: true, classroom: true, classId: true, className: true,
  assigneeId: true, assigneeName: true, teachingTeacherId: true, teachingTeacherName: true,
  class: { select: { id: true, name: true, teacherId: true, organizationId: true, campusId: true, teacher: { select: { name: true } } } },
  scheduleId: true, schedule: { select: { id: true, classId: true, organizationId: true, campusId: true,
    teacherId: true, startTime: true, endTime: true, classroom: true, teacher: { select: { name: true } } } },
} satisfies Prisma.ExperienceLessonSelect;
type Experience = Prisma.ExperienceLessonGetPayload<{ select: typeof experienceWorkSelect }>;

export function experienceWorkWhere(actor: Actor, day: string): Prisma.ExperienceLessonWhereInput {
  const scope = { organizationId: actor.organizationId, campusId: actor.campusId };
  const start = new Date(day + 'T00:00:00+08:00'), end = new Date(+start + 86400000);
  const teacher = ['teacher', 'coach'].includes(actor.role);
  const linked = { ...scope, class: { ...scope, status: 'active' }, status: { in: ['scheduled', 'completed'] },
    NOT: hiddenTimetableOccurrence(), startTime: { gte: start, lt: end } } satisfies Prisma.ScheduleWhereInput;
  return { AND: [experienceScopeWhere(actor.organizationId, actor.campusId), {
    status: { in: ['pending', 'completed', 'unconverted', 'noshow', 'no-show'] },
    OR: [
      // Preserve overdue sales follow-up without granting historical teaching access.
      { assigneeId: actor.userId, assignee: scope, scheduleDate: { lt: day } },
      { AND: [
        { OR: [{ scheduleId: null, scheduleDate: day, OR: [{ classId: null }, { class: { ...scope, status: 'active' } }] }, { schedule: linked }] },
        { OR: [
          { assigneeId: actor.userId, assignee: scope },
          ...(teacher ? [
            { schedule: { ...linked, OR: [{ teacherId: actor.userId }, { teacherId: null, class: { ...scope, teacherId: actor.userId, status: 'active' } }] } },
            { scheduleId: null, OR: [{ teachingTeacherId: actor.userId },
              { teachingTeacherId: null, class: { ...scope, teacherId: actor.userId, status: 'active' } }] },
          ] : []),
        ] },
      ] },
    ],
  }] };
}

const clock = (date: Date) => new Date(+date + 8 * 3600000).toISOString().slice(11, 16);
export function todayExperience(row: Experience, actor: Actor, day: string) {
  const schedule = row.schedule;
  const date = schedule ? new Date(+schedule.startTime + 8 * 3600000).toISOString().slice(0, 10) : row.scheduleDate;
  if (date !== day) return undefined;
  // Legacy malformed references cannot reveal a foreign occurrence or class.
  if (schedule && (schedule.organizationId !== actor.organizationId || schedule.campusId !== actor.campusId || schedule.classId !== row.classId)) return undefined;
  if (row.class && (row.class.organizationId !== actor.organizationId || row.class.campusId !== actor.campusId)) return undefined;
  const teacherId = schedule ? schedule.teacherId ?? row.class?.teacherId : row.teachingTeacherId ?? row.class?.teacherId;
  return { date: day, startTime: schedule ? clock(schedule.startTime) : row.startTime,
    endTime: schedule ? clock(schedule.endTime) : row.endTime,
    className: row.class?.name || row.className || '未定班', classroom: schedule?.classroom ?? row.classroom,
    teachingTeacherName: schedule ? schedule.teacher?.name || row.class?.teacher?.name || '未安排' : row.teachingTeacherName || row.class?.teacher?.name || '未安排',
    assigneeName: row.assigneeName || '未分配',
    teaching: ['teacher', 'coach'].includes(actor.role) && teacherId === actor.userId,
    sales: row.assigneeId === actor.userId };
}
export type TodayExperience = NonNullable<ReturnType<typeof todayExperience>>;
