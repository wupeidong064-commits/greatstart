"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dormantStudentWhere = void 0;
exports.responsibilityEnrollmentWhere = responsibilityEnrollmentWhere;
exports.teachingStudentWhere = teachingStudentWhere;
exports.dormantResourceWhere = dormantResourceWhere;
exports.recallStudentWhere = recallStudentWhere;
exports.renewalAccess = renewalAccess;
exports.uniqueResponsibleTeacher = uniqueResponsibleTeacher;
exports.lockHandoverRecallStudents = lockHandoverRecallStudents;
exports.syncHandoverRecallTeachers = syncHandoverRecallTeachers;
const errorHandler_1 = require("../middleware/errorHandler");
const scope_1 = require("../utils/scope");
const enrollmentPeriod_1 = require("./enrollmentPeriod");
/** Teaching responsibility is not attendance eligibility. Paused classes still
 * have a teacher and renewal obligations, but must not enter attendance stats. */
function responsibilityEnrollmentWhere(scope, now = new Date(), teacherId) {
    return { organizationId: scope.organizationId, status: 'active', enrolledAt: { lte: now },
        OR: [{ endedAt: null }, { endedAt: { gt: now } }],
        class: { ...scope, status: { not: 'deleted' }, ...(teacherId ? { teacherId } : {}) } };
}
function teachingStudentWhere(scope, teacherId, now = new Date()) {
    return { ...scope, status: { not: 'archived' }, enrollments: { some: responsibilityEnrollmentWhere(scope, now, teacherId) } };
}
const dormantStudentWhere = () => ({ status: { not: 'archived' }, OR: [{ status: 'lost' }, { renewalStatus: 'no_renewal' }] });
exports.dormantStudentWhere = dormantStudentWhere;
function dormantResourceWhere(scope, now = new Date()) {
    return { ...scope, status: { not: 'archived' }, OR: [
            { status: 'lost' }, { renewalStatus: 'no_renewal' },
            { status: 'active', recallTeacherId: { not: null }, enrollments: { none: responsibilityEnrollmentWhere(scope, now) } },
        ] };
}
/** A recalled learner stays visible until a real class takes over. This grants
 * profile follow-up only; never enrollment, attendance or renewal authority. */
function recallStudentWhere(scope, teacherId, now = new Date()) {
    return { ...scope, recallTeacherId: teacherId, status: { not: 'archived' }, OR: [
            { status: 'lost' }, { renewalStatus: 'no_renewal' },
            { status: 'active', enrollments: { none: responsibilityEnrollmentWhere(scope, now) } },
        ] };
}
function renewalAccess(req) {
    const actor = req.user, scope = (0, scope_1.resolveScope)(req);
    if (!actor?.id || !scope.campusId)
        throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
    const campus = { organizationId: scope.organizationId, campusId: scope.campusId };
    const management = ['admin', 'manager'].includes(actor.role);
    const teacher = ['teacher', 'coach'].includes(actor.role);
    if (!management && !teacher)
        throw new errorHandler_1.ApiError('续费由负责班级老师或管理员办理', 403, 'FORBIDDEN');
    return { actor, campus, management, teacher,
        where: management ? campus : teachingStudentWhere(campus, actor.id) };
}
async function uniqueResponsibleTeacher(tx, scope, studentId, actorId) {
    const rows = await tx.enrollment.findMany({ where: { ...responsibilityEnrollmentWhere(scope), studentId },
        select: { class: { select: { teacherId: true, teacher: { select: { id: true, role: true, organizationId: true, campusId: true, isPlatformAdmin: true } } } } } });
    const ids = [...new Set(rows.flatMap(row => {
            const teacher = row.class.teacher;
            return teacher && !teacher.isPlatformAdmin && teacher.organizationId === scope.organizationId && teacher.campusId === scope.campusId && ['teacher', 'coach'].includes(teacher.role) ? [teacher.id] : [];
        }))];
    if (actorId && ids.includes(actorId))
        return actorId;
    return ids.length === 1 ? ids[0] : null;
}
/** Called after ALL class owners in a batch changed. Multiple final teachers
 * stay unassigned instead of depending on the arbitrary class execution order. */
async function lockHandoverRecallStudents(tx, scope, classIds, formerTeacherId) {
    const students = await tx.student.findMany({ where: { ...scope, status: { not: 'archived' }, renewalStatus: 'no_renewal',
            AND: [{ OR: [{ recallTeacherId: null }, { recallTeacherId: formerTeacherId }] }],
            enrollments: { some: { ...responsibilityEnrollmentWhere(scope), classId: { in: classIds } } } }, select: { id: true }, orderBy: { id: 'asc' } });
    for (const student of students)
        await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, student.id, scope);
    return students.map(student => student.id);
}
async function syncHandoverRecallTeachers(tx, scope, studentIds, formerTeacherId) {
    const students = await tx.student.findMany({ where: { ...scope, status: { not: 'archived' }, renewalStatus: 'no_renewal',
            id: { in: studentIds },
            AND: [{ OR: [{ recallTeacherId: null }, { recallTeacherId: formerTeacherId }] }],
        }, select: { id: true, recallTeacherId: true } });
    for (const student of students) {
        const recallTeacherId = await uniqueResponsibleTeacher(tx, scope, student.id);
        await tx.student.updateMany({ where: { ...scope, id: student.id, recallTeacherId: student.recallTeacherId, renewalStatus: 'no_renewal', status: { not: 'archived' } }, data: { recallTeacherId } });
    }
}
//# sourceMappingURL=studentResponsibility.js.map