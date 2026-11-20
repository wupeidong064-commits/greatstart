"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const userController_1 = require("../controllers/userController");
exports.userRoutes = (0, express_1.Router)();
// 使用后端 JWT 认证
exports.userRoutes.use(auth_1.authenticate);
exports.userRoutes.use((0, rbac_1.requireOrganizationAccess)());
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: 获取用户列表
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
exports.userRoutes.get('/', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.getUsers);
exports.userRoutes.get('/teachers', userController_1.userController.getTeachers);
exports.userRoutes.get('/teachers/statistics', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.getCoachStatistics);
exports.userRoutes.get('/teachers/sales-data', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.getSalesStatistics);
// 新增端点 - 匹配前端调用
// staff及以上角色可以访问，控制器内已做数据隔离
exports.userRoutes.get('/coach-statistics', (0, rbac_1.requireMinRole)('staff'), userController_1.userController.getCoachStatistics);
exports.userRoutes.get('/sales-statistics', (0, rbac_1.requireMinRole)('staff'), userController_1.userController.getSalesStatistics);
/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: 获取用户详情
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
exports.userRoutes.get('/:id', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.getUserById);
/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: 创建用户
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
exports.userRoutes.post('/', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.createUser);
exports.userRoutes.post('/:id/reset-password', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.resetStaffPassword);
/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: 更新用户
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
exports.userRoutes.put('/:id/management', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.changeManagement);
exports.userRoutes.put('/:id', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.updateUser);
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: 删除用户
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
exports.userRoutes.delete('/:id', (0, rbac_1.requireMinRole)('manager'), userController_1.userController.deleteUser);
//# sourceMappingURL=users.js.map