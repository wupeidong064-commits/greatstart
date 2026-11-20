"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDefaultCampus = resolveDefaultCampus;
exports.createDefaultCampus = createDefaultCampus;
const errorHandler_1 = require("../middleware/errorHandler");
// Campus remains an internal data boundary; customers operate one organization.
async function resolveDefaultCampus(db, organizationId) {
    const organization = await db.organization.findUnique({ where: { id: organizationId } });
    if (!organization || !organization.isActive)
        throw new errorHandler_1.ApiError('机构不存在或已停用', 400, 'ORGANIZATION_UNAVAILABLE');
    const campuses = await db.campus.findMany({ where: { organizationId }, take: 2 });
    if (campuses.length !== 1)
        throw new errorHandler_1.ApiError('机构业务范围配置异常，请联系平台管理员核对', 409, 'ORGANIZATION_SCOPE_CONFLICT');
    if (!campuses[0].isActive)
        throw new errorHandler_1.ApiError('机构内部范围已停用', 409, 'ORGANIZATION_SCOPE_INACTIVE');
    return campuses[0];
}
// Only call while creating a new organization inside the same transaction.
async function createDefaultCampus(db, organizationId) {
    return db.campus.create({ data: { organizationId, name: '默认业务范围', code: 'MAIN' } });
}
//# sourceMappingURL=organizationScope.js.map