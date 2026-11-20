import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';

type CourseIdentity = { id: string; name: string; isActive: boolean };

// Callers hold the institution timetable lock through their class/course/schedule write.
async function findCourseByName(tx: Prisma.TransactionClient, organizationId: string, name: string) {
  // Compare literal names (including '%' and '_'); prefer the exact spelling in old data.
  const matches = await tx.$queryRaw<CourseIdentity[]>`
    SELECT id, name, "isActive" FROM courses
    WHERE "organizationId" = ${organizationId} AND lower(btrim(name)) = lower(${name.trim()})
    ORDER BY (name = ${name}) DESC, id LIMIT 2`;
  if (matches.length > 1 && (matches[0].name !== name || matches[1].name === name)) {
    throw new ApiError('课程目录中有多个同名类型，请先核对班级课程类型', 409, 'AMBIGUOUS_COURSE');
  }
  return matches[0];
}

export async function selectClassCourseType(tx: Prisma.TransactionClient, organizationId: string, value: unknown, currentType?: string) {
  // Existing classes can keep their legacy or inactive type when editing other details.
  if (currentType !== undefined && value === currentType) return currentType;
  if (typeof value !== 'string' || !value.trim()) throw new ApiError('请选择班级的课程类型', 400, 'INVALID_COURSE');
  const course = await findCourseByName(tx, organizationId, value.trim());
  if (!course) {
    const legacy = await tx.class.findFirst({ where: { organizationId, courseType: value }, select: { courseType: true } });
    if (!legacy) throw new ApiError('请先在班级管理中设置该课程类型', 400, 'COURSE_NOT_FOUND');
    await inheritClassCourse(tx, { organizationId, courseType: legacy.courseType });
    return legacy.courseType.trim();
  }
  if (!course.isActive) throw new ApiError('该课程类型已停用', 400, 'COURSE_INACTIVE');
  return course.name;
}

export async function inheritClassCourse(tx: Prisma.TransactionClient, cls: { organizationId: string; courseType: string }) {
  const name = cls.courseType.trim();
  if (!name) throw new ApiError('请先在班级管理中设置该班级的课程类型', 400, 'MISSING_CLASS_COURSE');
  const existing = await findCourseByName(tx, cls.organizationId, cls.courseType);
  if (existing) return existing.id;
  // Legacy classes predate the catalog; persist their actual label on the new occurrence.
  const course = await tx.course.create({ data: { organizationId: cls.organizationId, name, code: `COURSE-${randomUUID()}` }, select: { id: true } });
  return course.id;
}

export async function renameClassCourseType(tx: Prisma.TransactionClient, previous: { id: string; organizationId: string; name: string }, newName: string) {
  // Some imported classes used a case/space variant. Move only labels that resolve to this course.
  const labels = await tx.$queryRaw<{ courseType: string }[]>`
    SELECT DISTINCT "courseType" FROM classes WHERE "organizationId" = ${previous.organizationId}
    AND lower(btrim("courseType")) = lower(btrim(${previous.name}))`;
  for (const { courseType } of labels) {
    const course = await findCourseByName(tx, previous.organizationId, courseType);
    if (course?.id === previous.id) {
      await tx.class.updateMany({ where: { organizationId: previous.organizationId, courseType }, data: { courseType: newName } });
    }
  }
}
