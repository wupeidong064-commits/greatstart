"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadCampusWhere = leadCampusWhere;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
// Leads have no campus column: ownership is derived from their scoped assignee,
// with the creator used only for unassigned legacy records.
async function leadCampusWhere(organizationId, campusId) {
    if (!organizationId || !campusId)
        throw new errorHandler_1.ApiError('未分配机构或校区', 403, 'FORBIDDEN');
    const users = await database_1.default.user.findMany({ where: { organizationId, campusId }, select: { id: true } });
    const ids = users.map(u => u.id);
    return { organizationId, OR: [{ assigneeId: { in: ids } }, { assigneeId: null, createdById: { in: ids } }] };
}
//# sourceMappingURL=leadScope.js.map