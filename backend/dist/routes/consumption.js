"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumptionRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const consumptionController_1 = require("../controllers/consumptionController");
exports.consumptionRoutes = (0, express_1.Router)();
exports.consumptionRoutes.use(auth_1.authenticate);
exports.consumptionRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.consumptionRoutes.use((0, rbac_1.requireRole)('manager', 'admin'));
// 获取消耗统计
exports.consumptionRoutes.get('/statistics', consumptionController_1.consumptionController.getStatistics);
// 获取班级学员变动
exports.consumptionRoutes.get('/class-student-changes', consumptionController_1.consumptionController.getClassStudentChanges);
//# sourceMappingURL=consumption.js.map