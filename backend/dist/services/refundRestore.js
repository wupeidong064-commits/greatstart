"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundSnapshot = refundSnapshot;
exports.prepareRefundRestore = prepareRefundRestore;
const errorHandler_1 = require("../middleware/errorHandler");
const enrollmentPeriod_1 = require("./enrollmentPeriod");
const fields = (student) => ({ status: student.status, refundReason: student.refundReason, refundDate: student.refundDate?.toISOString() ?? null });
function refundSnapshot(student, after, enrollments, boundary) {
    return JSON.stringify({ kind: 'confirmed-refund', version: 2, before: fields(student), after: fields(after),
        boundary: boundary.toISOString(), enrollments: enrollments.map(e => ({ id: e.id, classId: e.classId, enrolledAt: e.enrolledAt.toISOString() })) });
}
const conflict = (message) => new errorHandler_1.ApiError(message + '，退费未取消', 409, 'REFUND_RESTORE_CONFLICT');
async function prepareRefundRestore(tx, refund, student, campus) {
    let snapshot;
    try {
        snapshot = JSON.parse(refund.notes ?? 'null');
    }
    catch { /* Historical approvals may have a free-text note. */ }
    if (snapshot?.kind !== 'confirmed-refund') {
        if (refund.submittedById === refund.reviewedById || await tx.refundConfirmReceipt.findUnique({ where: { requestId: refund.id }, select: { requestId: true } }))
            throw conflict('历史确认缺少原学员状态和报名快照，请核对原登记');
        // Two-person legacy review only debited lessons; it never ended enrollment or set refund fields.
        return { studentFields: {}, enrollments: [] };
    }
    if (snapshot.version !== 2 || !snapshot.before || !snapshot.after || !Array.isArray(snapshot.enrollments))
        throw conflict('历史确认缺少原学员状态和报名快照，请核对原登记');
    const current = fields(student);
    if (current.status !== snapshot.after.status || current.refundDate !== snapshot.after.refundDate || current.refundReason !== snapshot.after.refundReason)
        throw conflict('学员状态或退费资料在确认后已变更，请核对');
    const enrolled = snapshot.enrollments;
    if (new Set(enrolled.map(row => row.classId)).size !== enrolled.length)
        throw conflict('快照含同一班级的重复报名，请核对名册');
    const enrollments = [];
    for (const expected of [...enrolled].sort((a, b) => a.classId.localeCompare(b.classId))) {
        const cls = await (0, enrollmentPeriod_1.lockEnrollmentClass)(tx, expected.classId, campus);
        if (cls.status !== 'active')
            throw conflict('原班级已停用，请先恢复班级');
        const row = await tx.enrollment.findFirst({ where: { id: expected.id, classId: cls.id, studentId: student.id, organizationId: campus.organizationId },
            include: { class: { select: { name: true } } } });
        if (row?.status !== 'completed' || row.endedAt?.toISOString() !== snapshot.boundary || row.enrolledAt.toISOString() !== expected.enrolledAt)
            throw conflict('原报名已删除或变更，请核对');
        const overlap = await tx.enrollment.findFirst({ where: { studentId: student.id, classId: cls.id, id: { not: row.id },
                OR: [{ status: 'active' }, { enrolledAt: { gte: row.endedAt } }] }, select: { id: true } });
        if (overlap)
            throw conflict('原班级已有后续报名，请核对报名区间');
        await (0, enrollmentPeriod_1.assertEnrollmentCapacity)(tx, cls.id, cls.capacity);
        enrollments.push({ id: row.id, name: row.class.name });
    }
    return { studentFields: { status: snapshot.before.status, refundReason: snapshot.before.refundReason,
            refundDate: snapshot.before.refundDate ? new Date(snapshot.before.refundDate) : null }, enrollments };
}
//# sourceMappingURL=refundRestore.js.map