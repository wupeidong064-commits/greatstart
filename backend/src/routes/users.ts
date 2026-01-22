import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole, requireMinRole } from '../middleware/rbac';
import { userController } from '../controllers/userController';

export const userRoutes = Router();

// 所有路由需要认证
userRoutes.use(authenticate);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: 获取用户列表
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
userRoutes.get('/', requireMinRole('manager'), userController.getUsers);
userRoutes.get('/teachers/statistics', requireMinRole('manager'), userController.getTeachersStatistics);
userRoutes.get('/teachers/statistics/export', requireMinRole('manager'), userController.exportTeachersStatistics);
userRoutes.get('/teachers/sales-data', requireMinRole('manager'), userController.getTeachersSalesData);
userRoutes.get('/teachers/sales-data/export', requireMinRole('manager'), userController.exportTeachersSalesData);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: 获取用户详情
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
userRoutes.get('/:id', userController.getUserById);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: 创建用户
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
userRoutes.post('/', requireMinRole('manager'), userController.createUser);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: 更新用户
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
userRoutes.put('/:id', requireMinRole('manager'), userController.updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: 删除用户
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 */
userRoutes.delete('/:id', requireRole('admin'), userController.deleteUser);

