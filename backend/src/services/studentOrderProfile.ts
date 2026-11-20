import type { Conversion, Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { studentAccess } from '../utils/studentAccess';
import { parentMobileFromContact, parseProfileDate, studentGenderFromConversion, validateAddress, validateRecordedAge, validateStudentName, validateContactPhone } from '../utils/studentProfileFields';
import { lockEnrollmentStudent } from './enrollmentPeriod';

type Profile = Pick<Conversion, 'studentName' | 'age' | 'gender' | 'contact' | 'parentName' | 'address' | 'notes'>;

// Compare against the order, never against the current profile. Replaying a saved edit
// or sending a full, unchanged form must preserve subsequent student-management edits.
export function orderProfileChanges(order: Conversion, body: Record<string, unknown>): Partial<Profile> {
  const changes: Partial<Profile> = {};
  for (const field of ['studentName', 'contact', 'gender', 'parentName', 'address', 'notes'] as const) {
    const value = body[field];
    if (value === undefined || value === order[field]) continue;
    if (field === 'studentName' || field === 'contact') {
      if (typeof value !== 'string' || !value.trim()) throw new ApiError('学员姓名和联系方式不能为空', 400, 'INVALID_PARAMS');
      changes[field] = field === 'studentName' ? validateStudentName(value) : validateContactPhone(value)!;
    } else if (field === 'address') {
      changes.address = validateAddress(value);
    } else {
      if (value !== null && typeof value !== 'string') throw new ApiError('资料字段须为文本', 400, 'INVALID_PARAMS');
      changes[field] = value;
    }
    if (changes[field] === order[field]) delete changes[field];
  }
  if (body.age !== undefined && body.age !== order.age) changes.age = validateRecordedAge(body.age);
  return changes;
}

export async function applyLinkedStudentChanges(tx: Prisma.TransactionClient, req: AuthRequest, order: Conversion, changes: Partial<Profile>) {
  if (!order.studentId || !Object.keys(changes).some(field => field !== 'notes')) return;
  const access = studentAccess(req);
  await lockEnrollmentStudent(tx, order.studentId, access.campus);
  const student = await tx.student.findFirst({ where: { id: order.studentId, ...access.where },
    select: { id: true, parentPhone: true, status: true } });
  if (!student) throw new ApiError('无权更新关联学员档案', 403, 'FORBIDDEN');
  if (student.status === 'archived') throw new ApiError('关联学员已归档，请先恢复后再编辑档案', 409, 'STUDENT_ARCHIVED');
  const profile: Prisma.StudentUpdateInput = {};
  if (changes.studentName !== undefined) profile.name = changes.studentName;
  if (changes.gender !== undefined) profile.gender = studentGenderFromConversion(changes.gender);
  if (changes.parentName !== undefined) profile.parentName = changes.parentName;
  if (changes.address !== undefined) profile.address = changes.address;
  if (changes.age !== undefined) {
    profile.recordedAge = changes.age;
    profile.recordedAgeAt = changes.age === null ? null : parseProfileDate(order.conversionDate);
  }
  if (changes.contact !== undefined) {
    profile.phone = changes.contact;
    // An independently edited parent phone belongs to the student's profile.
    if (student.parentPhone === parentMobileFromContact(order.contact)) profile.parentPhone = parentMobileFromContact(changes.contact);
  }
  await tx.student.update({ where: { id: student.id }, data: profile });
}
