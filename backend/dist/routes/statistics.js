"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statisticsRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const statisticsController_1 = require("../controllers/statisticsController");
exports.statisticsRoutes = (0, express_1.Router)();
// 使用 JWT 认证
exports.statisticsRoutes.use(auth_1.authenticate);
exports.statisticsRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.statisticsRoutes.use((0, rbac_1.requireRole)('manager', 'admin'));
exports.statisticsRoutes.get('/students', statisticsController_1.statisticsController.getStudentStatistics);
exports.statisticsRoutes.get('/attendance', statisticsController_1.statisticsController.getAttendanceStatistics);
exports.statisticsRoutes.get('/courses', statisticsController_1.statisticsController.getCourseStatistics);
exports.statisticsRoutes.get('/finance', statisticsController_1.statisticsController.getFinanceStatistics);
exports.statisticsRoutes.get('/dashboard', statisticsController_1.statisticsController.getDashboard);
exports.statisticsRoutes.get('/weekly-summary', statisticsController_1.statisticsController.getWeeklySummary);
exports.statisticsRoutes.get('/monthly-summary', statisticsController_1.statisticsController.getMonthlySummary);
exports.statisticsRoutes.get('/consumption', statisticsController_1.statisticsController.getConsumptionStatistics);
//# sourceMappingURL=statistics.js.map