import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';
import { computeSessionAttendance } from './attendanceStatsService';

type Scope = { organizationId: string; campusId: string };

function boundary(value: unknown, end: boolean) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))
    throw new ApiError('日期应为有效日期或带时区的时间', 400, 'INVALID_DATE');
  const day = value.slice(0, 10), calendar = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(+calendar) || calendar.toISOString().slice(0, 10) !== day)
    throw new ApiError('日期无效', 400, 'INVALID_DATE');
  const date = new Date(value.length === 10 ? day + (end ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00') : value);
  if (!Number.isFinite(+date)) throw new ApiError('日期无效', 400, 'INVALID_DATE');
  return date;
}

export function classAttendanceFilters(query: Record<string, unknown>) {
  const start = boundary(query.startDate, false), end = boundary(query.endDate, true);
  if (start && end && start > end) throw new ApiError('开始日期不能晚于结束日期', 400, 'INVALID_DATE');
  if (query.teacherId !== undefined && typeof query.teacherId !== 'string') throw new ApiError('老师筛选无效', 400, 'INVALID_TEACHER');
  let maxAttendanceRate: number | undefined;
  if (query.maxAttendanceRate !== undefined) {
    if (typeof query.maxAttendanceRate !== 'string' || !/^\d+(?:\.\d+)?$/.test(query.maxAttendanceRate))
      throw new ApiError('出勤率上限须在0至100之间', 400, 'INVALID_THRESHOLD');
    maxAttendanceRate = Number(query.maxAttendanceRate);
    if (!Number.isFinite(maxAttendanceRate) || maxAttendanceRate > 100)
      throw new ApiError('出勤率上限须在0至100之间', 400, 'INVALID_THRESHOLD');
  }
  return { start, end, teacherId: query.teacherId || undefined, maxAttendanceRate };
}

export async function classAttendanceSessions(tx: Prisma.TransactionClient, scope: Scope, classId: string, query: Record<string, unknown>) {
  const { start, end } = classAttendanceFilters(query);
  const integer = (value: unknown, fallback: number, maximum: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum)
      throw new ApiError('分页参数无效', 400, 'INVALID_PAGINATION');
    return Number(value);
  };
  const page = integer(query.page, 1, 1000000), pageSize = integer(query.pageSize, 10, 100);
  if (!await tx.class.findFirst({ where: { id: classId, ...scope }, select: { id: true } }))
    throw new ApiError('班级不存在或不属于当前校区', 404, 'CLASS_NOT_FOUND');
  const where: Prisma.ScheduleWhereInput = { ...scope, classId, status: 'completed',
    startTime: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } };
  // Page occurrences before fetching attendance: one occurrence remains one
  // row regardless of roster size, retries, corrections or temporary students.
  const [total, schedules] = await Promise.all([
    tx.schedule.count({ where }),
    tx.schedule.findMany({ where, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, classId: true, startTime: true, endTime: true, status: true } }),
  ]);
  const [enrollments, attendances] = await Promise.all([
    tx.enrollment.findMany({ where: { organizationId: scope.organizationId, classId },
      select: { classId: true, studentId: true, enrolledAt: true, endedAt: true, status: true } }),
    tx.attendance.findMany({ where: { organizationId: scope.organizationId, classId, scheduleId: { in: schedules.map(s => s.id) } },
      select: { studentId: true, scheduleId: true, classId: true, status: true, isTemporary: true } }),
  ]);
  const data = schedules.map(schedule => {
    const marks = attendances.filter(a => a.scheduleId === schedule.id);
    const row = computeSessionAttendance({ schedules: [schedule], enrollments, attendances: marks });
    return { id: schedule.id, startTime: schedule.startTime, endTime: schedule.endTime, status: schedule.status,
      expectedAttendance: row.expected, actualAttendance: row.present, attendanceRate: row.rate,
      markedStudents: new Set(marks.map(a => a.studentId)).size };
  });
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
