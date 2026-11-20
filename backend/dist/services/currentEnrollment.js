"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentEnrollmentWhere = currentEnrollmentWhere;
/** Current class membership, shared by student lists and attendance follow-up.
 * Timetables and temporary attendance never turn an unassigned student into a member.
 */
function currentEnrollmentWhere(scope, now = new Date()) {
    return {
        organizationId: scope.organizationId,
        status: 'active',
        enrolledAt: { lte: now },
        OR: [{ endedAt: null }, { endedAt: { gt: now } }],
        class: {
            organizationId: scope.organizationId,
            ...(scope.campusId ? { campusId: scope.campusId } : {}),
            status: 'active',
        },
    };
}
//# sourceMappingURL=currentEnrollment.js.map