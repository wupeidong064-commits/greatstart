"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectClassCourseType = selectClassCourseType;
exports.inheritClassCourse = inheritClassCourse;
exports.renameClassCourseType = renameClassCourseType;
const node_crypto_1 = require("node:crypto");
const errorHandler_1 = require("../middleware/errorHandler");
// Callers hold the institution timetable lock through their class/course/schedule write.
async function findCourseByName(tx, organizationId, name) {
    // Compare literal names (including '%' and '_'); prefer the exact spelling in old data.
    const matches = await tx.$queryRaw `
    SELECT id, name, "isActive" FROM courses
    WHERE "organizationId" = ${organizationId} AND lower(btrim(name)) = lower(${name.trim()})
    ORDER BY (name = ${name}) DESC, id LIMIT 2`;
    if (matches.length > 1 && (matches[0].name !== name || matches[1].name === name)) {
        throw new errorHandler_1.ApiError('课程目录中有多个同名类型，请先核对班级课程类型', 409, 'AMBIGUOUS_COURSE');
    }
    return matches[0];
}
async function selectClassCourseType(tx, organizationId, value, currentType) {
    // Existing classes can keep their legacy or inactive type when editing other details.
    if (currentType !== undefined && value === currentType)
        return currentType;
    if (typeof value !== 'string' || !value.trim())
        throw new errorHandler_1.ApiError('请选择班级的课程类型', 400, 'INVALID_COURSE');
    const course = await findCourseByName(tx, organizationId, value.trim());
    if (!course) {
        const legacy = await tx.class.findFirst({ where: { organizationId, courseType: value }, select: { courseType: true } });
        if (!legacy)
            throw new errorHandler_1.ApiError('请先在班级管理中设置该课程类型', 400, 'COURSE_NOT_FOUND');
        await inheritClassCourse(tx, { organizationId, courseType: legacy.courseType });
        return legacy.courseType.trim();
    }
    if (!course.isActive)
        throw new errorHandler_1.ApiError('该课程类型已停用', 400, 'COURSE_INACTIVE');
    return course.name;
}
async function inheritClassCourse(tx, cls) {
    const name = cls.courseType.trim();
    if (!name)
        throw new errorHandler_1.ApiError('请先在班级管理中设置该班级的课程类型', 400, 'MISSING_CLASS_COURSE');
    const existing = await findCourseByName(tx, cls.organizationId, cls.courseType);
    if (existing)
        return existing.id;
    // Legacy classes predate the catalog; persist their actual label on the new occurrence.
    const course = await tx.course.create({ data: { organizationId: cls.organizationId, name, code: `COURSE-${(0, node_crypto_1.randomUUID)()}` }, select: { id: true } });
    return course.id;
}
async function renameClassCourseType(tx, previous, newName) {
    // Some imported classes used a case/space variant. Move only labels that resolve to this course.
    const labels = await tx.$queryRaw `
    SELECT DISTINCT "courseType" FROM classes WHERE "organizationId" = ${previous.organizationId}
    AND lower(btrim("courseType")) = lower(btrim(${previous.name}))`;
    for (const { courseType } of labels) {
        const course = await findCourseByName(tx, previous.organizationId, courseType);
        if (course?.id === previous.id) {
            await tx.class.updateMany({ where: { organizationId: previous.organizationId, courseType }, data: { courseType: newName } });
        }
    }
}
//# sourceMappingURL=classCourseType.js.map