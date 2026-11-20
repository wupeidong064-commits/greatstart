"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderProfileChanges = orderProfileChanges;
exports.applyLinkedStudentChanges = applyLinkedStudentChanges;
const errorHandler_1 = require("../middleware/errorHandler");
const studentAccess_1 = require("../utils/studentAccess");
const studentProfileFields_1 = require("../utils/studentProfileFields");
const enrollmentPeriod_1 = require("./enrollmentPeriod");
// Compare against the order, never against the current profile. Replaying a saved edit
// or sending a full, unchanged form must preserve subsequent student-management edits.
function orderProfileChanges(order, body) {
    const changes = {};
    for (const field of ['studentName', 'contact', 'gender', 'parentName', 'address', 'notes']) {
        const value = body[field];
        if (value === undefined || value === order[field])
            continue;
        if (field === 'studentName' || field === 'contact') {
            if (typeof value !== 'string' || !value.trim())
                throw new errorHandler_1.ApiError('学员姓名和联系方式不能为空', 400, 'INVALID_PARAMS');
            changes[field] = field === 'studentName' ? (0, studentProfileFields_1.validateStudentName)(value) : (0, studentProfileFields_1.validateContactPhone)(value);
        }
        else if (field === 'address') {
            changes.address = (0, studentProfileFields_1.validateAddress)(value);
        }
        else {
            if (value !== null && typeof value !== 'string')
                throw new errorHandler_1.ApiError('资料字段须为文本', 400, 'INVALID_PARAMS');
            changes[field] = value;
        }
        if (changes[field] === order[field])
            delete changes[field];
    }
    if (body.age !== undefined && body.age !== order.age)
        changes.age = (0, studentProfileFields_1.validateRecordedAge)(body.age);
    return changes;
}
async function applyLinkedStudentChanges(tx, req, order, changes) {
    if (!order.studentId || !Object.keys(changes).some(field => field !== 'notes'))
        return;
    const access = (0, studentAccess_1.studentAccess)(req);
    await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, order.studentId, access.campus);
    const student = await tx.student.findFirst({ where: { id: order.studentId, ...access.where },
        select: { id: true, parentPhone: true, status: true } });
    if (!student)
        throw new errorHandler_1.ApiError('无权更新关联学员档案', 403, 'FORBIDDEN');
    if (student.status === 'archived')
        throw new errorHandler_1.ApiError('关联学员已归档，请先恢复后再编辑档案', 409, 'STUDENT_ARCHIVED');
    const profile = {};
    if (changes.studentName !== undefined)
        profile.name = changes.studentName;
    if (changes.gender !== undefined)
        profile.gender = (0, studentProfileFields_1.studentGenderFromConversion)(changes.gender);
    if (changes.parentName !== undefined)
        profile.parentName = changes.parentName;
    if (changes.address !== undefined)
        profile.address = changes.address;
    if (changes.age !== undefined) {
        profile.recordedAge = changes.age;
        profile.recordedAgeAt = changes.age === null ? null : (0, studentProfileFields_1.parseProfileDate)(order.conversionDate);
    }
    if (changes.contact !== undefined) {
        profile.phone = changes.contact;
        // An independently edited parent phone belongs to the student's profile.
        if (student.parentPhone === (0, studentProfileFields_1.parentMobileFromContact)(order.contact))
            profile.parentPhone = (0, studentProfileFields_1.parentMobileFromContact)(changes.contact);
    }
    await tx.student.update({ where: { id: student.id }, data: profile });
}
//# sourceMappingURL=studentOrderProfile.js.map