import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import { parseProfileDate } from '../utils/studentProfileFields';

export type ScheduleSlot = {
  organizationId: string;
  campusId: string | null;
  classId: string;
  courseId?: string | null;
  teacherId: string | null;
  startTime: Date;
  endTime: Date;
  classroom: string | null;
};

/** One lock for all timetable mutations in an institution. Always acquire before
 * occurrence locks. Attendance only acquires occurrence -> student locks, never
 * this lock. The two-int advisory namespace is separate from existing bigint locks. */
export async function lockScheduleWrites(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1735352947, hashtext(${organizationId}))`;
}

export const CLASS_PAUSED = 'class_paused';

// Inactive/deleted classes can retain scheduled rows carrying attendance or ledger history.
export function hiddenTimetableOccurrence(): Prisma.ScheduleWhereInput {
  const future = { gt: new Date() };
  return { OR: [
    { status: CLASS_PAUSED },
    { startTime: future, class: { status: 'deleted' } },
    { startTime: future, status: { in: ['scheduled', 'cancelled', 'rescheduled'] }, class: { status: 'inactive' } },
  ] };
}

export function normalizeClassroom(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ApiError('教室名称无效', 400, 'INVALID_CLASSROOM');
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US') || null;
}

export function validateScheduleTime(start: Date, end: Date) {
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) {
    throw new ApiError('排课时间无效', 400, 'INVALID_TIME');
  }
}

export function parseScheduleTime(value: unknown): Date {
  try {
    const parsed = parseProfileDate(value);
    if (parsed) return parsed;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
  throw new ApiError('排课时间无效', 400, 'INVALID_TIME');
}

const localClock = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function describeInterval(start: Date, end: Date) {
  return `${localClock.format(start)} 至 ${localClock.format(end)}`;
}

/** Caller must hold lockScheduleWrites in the same transaction through the write.
 * Returns a reusable occurrence only for an explicitly allowed exact create retry.
 * Existing rooms are normalized at comparison time, without rewriting history. */
export async function assertScheduleAvailable(
  tx: Prisma.TransactionClient,
  slot: ScheduleSlot,
  options: { excludeIds?: string[]; allowExactReuse?: boolean; inheritCourse?: boolean } = {},
) {
  validateScheduleTime(slot.startTime, slot.endTime);
  const room = normalizeClassroom(slot.classroom);
  const overlaps = await tx.schedule.findMany({
    where: {
      organizationId: slot.organizationId,
      status: { notIn: ['cancelled', 'rescheduled'] },
      NOT: hiddenTimetableOccurrence(),
      startTime: { lt: slot.endTime },
      endTime: { gt: slot.startTime },
      ...(options.excludeIds?.length ? { id: { notIn: options.excludeIds } } : {}),
    },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
  });
  let reusable: (typeof overlaps)[number] | undefined;
  for (const row of overlaps) {
    const sameClass = row.classId === slot.classId;
    const sameTeacher = !!slot.teacherId && row.teacherId === slot.teacherId;
    const sameRoom = !!room && row.campusId === slot.campusId && normalizeClassroom(row.classroom) === room;
    if (!sameClass && !sameTeacher && !sameRoom) continue;
    if (options.allowExactReuse && !reusable && row.status === 'scheduled' && sameClass &&
        row.campusId === slot.campusId && row.teacherId === slot.teacherId &&
        (options.inheritCourse || row.courseId === (slot.courseId ?? null)) &&
        +row.startTime === +slot.startTime && +row.endTime === +slot.endTime &&
        normalizeClassroom(row.classroom) === room) {
      reusable = row;
      continue;
    }
    const resource = sameClass ? '班级' : sameTeacher ? '教师' : '教室';
    const details = row.campusId === slot.campusId
      ? await tx.schedule.findUnique({ where: { id: row.id }, select: {
          class: { select: { name: true } }, teacher: { select: { name: true } },
        } })
      : null;
    const className = details ? `「${details.class.name}」` : '其他校区班级';
    const resourceName = sameTeacher && !sameClass && details?.teacher ? `教师「${details.teacher.name}」`
      : sameRoom && !sameClass && !sameTeacher ? `教室「${row.classroom}」` : resource;
    const existing = describeInterval(row.startTime, row.endTime);
    const requested = describeInterval(slot.startTime, slot.endTime);
    throw new ApiError(`重复排课：该时间已有班级——拟排 ${requested} 与${className}已有场次 ${existing} 的${resourceName}时间重叠（北京时间）`, 409, 'SCHEDULE_CONFLICT');
  }
  return reusable;
}

/** 生成结果的共存提醒（2026-11-07 用户拍板的重复提示三档口径）：
 *  墙钟重叠但硬冲突检查放行的场次——不同班级/老师/教室的课，以及已停课班级的场次
 *  （停课即释放时间，可照常排，但操作者应知道"该时间点已有一节课"）。
 *  本班 scheduled 的重叠行是幂等复用对象本身，不进提醒。 */
export type CoexistingNote = {
  scheduleId: string;
  startTime: Date;
  endTime: Date;
  className: string;
  teacherName: string | null;
  sessionStatus: string;
  classStatus: string;
};

export async function findCoexistingSessions(
  tx: Prisma.TransactionClient,
  slot: ScheduleSlot,
  options: { excludeIds?: string[] } = {},
): Promise<CoexistingNote[]> {
  const overlaps = await tx.schedule.findMany({
    where: {
      organizationId: slot.organizationId,
      status: { notIn: ['cancelled', 'rescheduled'] },
      startTime: { lt: slot.endTime },
      endTime: { gt: slot.startTime },
      ...(options.excludeIds?.length ? { id: { notIn: options.excludeIds } } : {}),
    },
    include: { class: { select: { name: true, status: true } }, teacher: { select: { name: true } } },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
  });
  const notes: CoexistingNote[] = [];
  for (const row of overlaps) {
    // 本班 scheduled 重叠=完全相同场次复用对象本身；class_paused 的本班场次仍提醒（该时段停着课）。
    if (row.classId === slot.classId && row.status === 'scheduled') continue;
    notes.push({
      scheduleId: row.id, startTime: row.startTime, endTime: row.endTime,
      className: row.class.name, teacherName: row.teacher?.name ?? null,
      sessionStatus: row.status, classStatus: row.class.status,
    });
  }
  return notes;
}
