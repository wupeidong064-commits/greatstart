"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.experienceScopeWhere = experienceScopeWhere;
const errorHandler_1 = require("../middleware/errorHandler");
/** 体验课无独立校区字段，关联班级优先，未分班时使用负责员工校区。 */
function experienceScopeWhere(organizationId, campusId) {
    if (!organizationId)
        throw new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN');
    return { organizationId, ...(campusId ? { OR: [
                { class: { campusId, organizationId } },
                { classId: null, assignee: { campusId, organizationId } },
            ] } : {}) };
}
//# sourceMappingURL=experienceScope.js.map