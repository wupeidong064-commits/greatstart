"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonLogRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const lessonPricingController_1 = require("../controllers/lessonPricingController");
const lessonLogController_1 = require("../controllers/lessonLogController");
exports.lessonLogRoutes = (0, express_1.Router)();
// 使用后端 JWT 认证
exports.lessonLogRoutes.use(auth_1.authenticate);
exports.lessonLogRoutes.use((0, rbac_1.requireOrganizationAccess)());
// 获取课时日志列表
exports.lessonLogRoutes.get('/pricing', lessonPricingController_1.lessonPricingController.get);
exports.lessonLogRoutes.post('/pricing', lessonPricingController_1.lessonPricingController.confirm);
exports.lessonLogRoutes.get('/balance', lessonLogController_1.lessonLogController.getBalance);
exports.lessonLogRoutes.get('/', lessonLogController_1.lessonLogController.getLessonLogs);
// 创建课时日志
exports.lessonLogRoutes.post('/', lessonLogController_1.lessonLogController.createLessonLog);
// 增课
exports.lessonLogRoutes.post('/add', lessonLogController_1.lessonLogController.addLessons);
// 划课（扣减课时）
exports.lessonLogRoutes.post('/deduct', lessonLogController_1.lessonLogController.deductLessons);
// 2026-11-08 用户拍板（⑫）：活动划课——不选班级/场次，直接扣课时（备注必填）
exports.lessonLogRoutes.post('/activity-deduct', lessonLogController_1.lessonLogController.activityDeduct);
//# sourceMappingURL=lessonLogs.js.map