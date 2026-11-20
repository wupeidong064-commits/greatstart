"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rbac_1 = require("../middleware/rbac");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const parentController_1 = require("../controllers/parentController");
const router = (0, express_1.Router)();
// 所有路由都需要认证（使用后端 JWT 验证）
router.use(auth_1.authenticate);
router.use((0, rbac_1.requireRole)('parent'));
/**
 * @route   GET /api/parent/students
 * @desc    获取与当前家长用户关联的学员列表
 * @access  Parent
 */
router.get('/students', parentController_1.parentController.getLinkedStudents);
/**
 * @route   GET /api/parent/schedules/:studentId
 * @desc    获取指定学员的课表（已报名班级的课时安排）
 * @access  Parent
 */
router.get('/schedules/:studentId', parentController_1.parentController.getStudentSchedules);
/**
 * @route   GET /api/parent/attendances/:studentId
 * @desc    获取指定学员的出勤记录
 * @access  Parent
 */
router.get('/attendances/:studentId', parentController_1.parentController.getStudentAttendances);
/**
 * @route   GET /api/parent/payments/:studentId
 * @desc    获取指定学员的缴费记录
 * @access  Parent
 */
router.get('/payments/:studentId', parentController_1.parentController.getStudentPayments);
router.get('/lesson-logs/:studentId', parentController_1.parentController.getStudentLessonLogs);
router.get('/notifications/:studentId', parentController_1.parentController.getStudentNotices);
exports.default = router;
//# sourceMappingURL=parents.js.map