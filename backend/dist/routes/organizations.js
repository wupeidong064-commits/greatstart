"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationRoutes = void 0;
const express_1 = require("express");
const rbac_1 = require("../middleware/rbac");
const auth_1 = require("../middleware/auth");
const managementAccess_1 = require("../services/managementAccess");
const database_1 = __importDefault(require("../config/database"));
const managedUsers_1 = require("../services/managedUsers");
const response_1 = require("../utils/response");
const organizationController_1 = require("../controllers/organizationController");
exports.organizationRoutes = (0, express_1.Router)();
exports.organizationRoutes.use(auth_1.authenticate);
// Admin 和 Manager 都可以获取机构列表（Manager 只能看到自己的）
exports.organizationRoutes.get('/', organizationController_1.organizationController.getOrganizations);
exports.organizationRoutes.get('/:id/administrators', rbac_1.platformOnly, async (req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, (await database_1.default.user.findMany({ where: { organizationId: req.params.id, isPlatformAdmin: false, role: { not: 'parent' } }, select: managedUsers_1.userFields, orderBy: [{ name: 'asc' }, { id: 'asc' }] })).map(managementAccess_1.staffUser));
    }
    catch (e) {
        next(e);
    }
});
exports.organizationRoutes.put('/:id/administrators/:userId', rbac_1.platformOnly, async (req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, await (0, managementAccess_1.changeManagement)(req.user, req.params.id, req.params.userId, req.body.managementLevel, req.body.expectedLevel), '管理任命已更新');
    }
    catch (e) {
        next(e);
    }
});
exports.organizationRoutes.get('/:id', organizationController_1.organizationController.getOrganizationById);
exports.organizationRoutes.post('/', rbac_1.platformOnly, organizationController_1.organizationController.createOrganization);
exports.organizationRoutes.put('/:id', rbac_1.platformOnly, organizationController_1.organizationController.updateOrganization);
exports.organizationRoutes.delete('/:id', rbac_1.platformOnly, organizationController_1.organizationController.deleteOrganization);
//# sourceMappingURL=organizations.js.map