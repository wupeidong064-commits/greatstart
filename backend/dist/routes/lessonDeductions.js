"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonDeductionRoutes = void 0;
const express_1 = require("express");
const rbac_1 = require("../middleware/rbac");
const auth_1 = require("../middleware/auth");
const lessonDeductionController_1 = require("../controllers/lessonDeductionController");
exports.lessonDeductionRoutes = (0, express_1.Router)();
// 使用认证中间件
exports.lessonDeductionRoutes.use(auth_1.authenticate, (0, rbac_1.requireOrganizationAccess)(), (0, rbac_1.requireRole)('admin', 'manager'));
// 检查班级在某天是否已划课
exports.lessonDeductionRoutes.get('/check/:classId', lessonDeductionController_1.lessonDeductionController.checkDailyDeduction);
// 获取班级的划课记录
exports.lessonDeductionRoutes.get('/records/:classId', lessonDeductionController_1.lessonDeductionController.getClassDeductionRecords);
//# sourceMappingURL=lessonDeductions.js.map