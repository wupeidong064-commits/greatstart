"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashflowSummaryRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const cashflowSummaryController_1 = require("../controllers/cashflowSummaryController");
exports.cashflowSummaryRoutes = (0, express_1.Router)();
exports.cashflowSummaryRoutes.use(auth_1.authenticate);
exports.cashflowSummaryRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.cashflowSummaryRoutes.use((0, rbac_1.requireRole)('manager', 'admin'));
// 获取现金流总结
exports.cashflowSummaryRoutes.get('/', cashflowSummaryController_1.cashflowSummaryController.getSummary);
//# sourceMappingURL=cashflowSummary.js.map