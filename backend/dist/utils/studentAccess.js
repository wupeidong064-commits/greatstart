"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentAccess = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const scope_1 = require("./scope");
const studentResponsibility_1 = require("../services/studentResponsibility");
const studentAccess = (req, options = {}) => {
    const actor = req.user;
    const scope = (0, scope_1.resolveScope)(req);
    if (!actor?.id || !scope.campusId)
        throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
    const campus = { organizationId: scope.organizationId, campusId: scope.campusId };
    const management = ['admin', 'manager'].includes(actor.role || '');
    const teacher = ['teacher', 'coach'].includes(actor.role || '');
    if (!management && !teacher && !['sales', 'staff'].includes(actor.role || ''))
        throw new errorHandler_1.ApiError('无权访问学员档案', 403, 'FORBIDDEN');
    const owned = management
        ? {}
        : teacher
            ? {
                OR: [
                    (0, studentResponsibility_1.teachingStudentWhere)(campus, actor.id),
                    ...(options.includeRecall ? [(0, studentResponsibility_1.recallStudentWhere)(campus, actor.id)] : []),
                ],
            }
            : { salesId: actor.id };
    return { actor, campus, management, teacher, where: { ...campus, ...(management ? {} : { status: { not: 'archived' } }), ...owned } };
};
exports.studentAccess = studentAccess;
//# sourceMappingURL=studentAccess.js.map