import type { Enrollment, Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';

type CampusScope = { organizationId: string; campusId: string };

// Share the attendance student lock before any student row lock. All enrollment
// writers use this order so an attendance decision and an end date cannot race.
export async function lockEnrollmentStudent(tx: Prisma.TransactionClient, studentId: string, scope: CampusScope) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;
  const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM students WHERE id = ${studentId}
    AND "organizationId" = ${scope.organizationId} AND "campusId" = ${scope.campusId} FOR UPDATE`;
  if (!rows.length) throw new ApiError('学员不存在或不属于当前校区', 404, 'STUDENT_NOT_FOUND');
  return rows[0];
}

export async function lockEnrollmentClass(tx: Prisma.TransactionClient, classId: string, scope: CampusScope) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string; capacity: number; teacherId: string | null }>>`
    SELECT id, status, capacity, "teacherId" FROM classes WHERE id = ${classId}
    AND "organizationId" = ${scope.organizationId} AND "campusId" = ${scope.campusId} FOR UPDATE`;
  if (!rows.length) throw new ApiError('班级不存在或不属于当前校区', 404, 'CLASS_NOT_FOUND');
  return rows[0];
}

export function rejectClientEnrollmentPeriod(body: Record<string, unknown>) {
  if (Object.prototype.hasOwnProperty.call(body, 'endedAt') || Object.prototype.hasOwnProperty.call(body, 'enrolledAt')) {
    throw new ApiError('报名起止时间由服务器记录，不能直接指定', 400, 'SERVER_MANAGED_ENROLLMENT_PERIOD');
  }
}

// Caller holds the student's advisory and row locks until commit.
function assertEnrollmentEndPeriod(enrollment: Enrollment, endedAt: Date) {
  if (enrollment.status !== 'active' || enrollment.endedAt) throw new ApiError('已结束的报名不能覆盖', 409, 'ENROLLMENT_ALREADY_ENDED');
  if (+enrollment.enrolledAt > +endedAt) throw new ApiError('报名开始时间晚于当前时间，不能结束', 409, 'INVALID_ENROLLMENT_PERIOD');
}

export async function assertCanEndEnrollment(tx: Prisma.TransactionClient, enrollment: Enrollment, endedAt: Date) {
  assertEnrollmentEndPeriod(enrollment, endedAt);
  const futureAttendance = await tx.attendance.findFirst({ where: {
    organizationId: enrollment.organizationId, studentId: enrollment.studentId, classId: enrollment.classId,
    isTemporary: false, schedule: { endTime: { gte: endedAt } },
  }, select: { id: true } });
  if (futureAttendance) throw new ApiError('报名仍有关联的未结束场次考勤，请先核对考勤，不能覆盖报名历史', 409, 'ENROLLMENT_HAS_FUTURE_ATTENDANCE');
}

// A confirmed departure ends membership now, even when a teacher recorded a
// future occurrence in advance. Preserve those attendance IDs in the removal
// receipt so existing facts and later corrections survive, without granting
// permission to record any new attendance after departure. Caller holds locks.
export async function recordedAttendanceForRemoval(tx: Prisma.TransactionClient, enrollment: Enrollment, endedAt: Date) {
  assertEnrollmentEndPeriod(enrollment, endedAt);
  const rows = await tx.attendance.findMany({ where: {
    organizationId: enrollment.organizationId, studentId: enrollment.studentId, classId: enrollment.classId, isTemporary: false,
    schedule: { organizationId: enrollment.organizationId, classId: enrollment.classId, endTime: { gte: endedAt } },
  }, select: { id: true }, orderBy: { id: 'asc' } });
  return rows.map(row => row.id);
}

export async function assertEnrollmentCapacity(tx: Prisma.TransactionClient, classId: string, capacity: number) {
  if (capacity > 0 && await tx.enrollment.count({ where: { classId, status: 'active' } }) >= capacity) {
    throw new ApiError('班级已满', 409, 'CLASS_FULL');
  }
}

// Conversion/renewal callers already hold the student lock. End and start share
// one instant, including when returning to a class with historical enrollments.
export async function enrollForConversion(tx: Prisma.TransactionClient, studentId: string, classId: string, scope: CampusScope, replaceOld: boolean, enrolledBy?: string) {
  const destination = await lockEnrollmentClass(tx, classId, scope);
  if (destination.status !== 'active') throw new ApiError('班级已停用', 409, 'CLASS_UNAVAILABLE');
  if (await tx.enrollment.findFirst({ where: { studentId, classId, status: 'active' } })) return;
  await assertEnrollmentCapacity(tx, classId, destination.capacity);
  const now = new Date();
  if (replaceOld) {
    const oldEnrollments = await tx.enrollment.findMany({ where: { studentId, organizationId: scope.organizationId, class: scope, status: 'active', classId: { not: classId } } });
    for (const enrollment of oldEnrollments) {
      await assertCanEndEnrollment(tx, enrollment, now);
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: 'completed', endedAt: now } });
    }
  }
  await tx.enrollment.create({ data: { organizationId: scope.organizationId, studentId, classId, enrolledAt: now, enrolledBy } });
}
