"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveScope = resolveScope;
exports.campusWhere = campusWhere;
const errorHandler_1 = require("../middleware/errorHandler");
function resolveScope(req) {
    const user = req.user;
    if (!user || typeof user.organizationId !== 'string' || !user.organizationId) {
        throw new errorHandler_1.ApiError('未分配机构，拒绝无范围查询', 403, 'FORBIDDEN');
    }
    const orgId = user.organizationId;
    const campusId = user.campusId ?? null;
    const q = req.query || {};
    const b = req.body || {};
    if (q.organizationId && q.organizationId !== orgId) {
        throw new errorHandler_1.ApiError('无权访问该机构数据', 403, 'ORG_MISMATCH');
    }
    if (b.organizationId && b.organizationId !== orgId) {
        throw new errorHandler_1.ApiError('无权访问该机构数据', 403, 'ORG_MISMATCH');
    }
    if (q.campusId && campusId && q.campusId !== campusId) {
        throw new errorHandler_1.ApiError('无权访问其他校区数据', 403, 'CAMPUS_MISMATCH');
    }
    if (b.campusId && campusId && b.campusId !== campusId) {
        throw new errorHandler_1.ApiError('无权访问其他校区数据', 403, 'CAMPUS_MISMATCH');
    }
    return { organizationId: orgId, campusId };
}
// 校区条件组装：机构级不过滤 campus（=本机构全部校区）；校区级严格等于本人校区
function campusWhere(scope) {
    return scope.campusId ? { campusId: scope.campusId } : {};
}
//# sourceMappingURL=scope.js.map