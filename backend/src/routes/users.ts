import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole, requireMinRole, requireOrganizationAccess } from '../middleware/rbac';
import { userController } from '../controllers/userController';

export const userRoutes = Router();

// 使用后端 JWT 认证（而非 MemFire token）
userRoutes.use(authenticate);
userRoutes.use(requireOrganizationAccess());

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
userRoutes.get('/teachers', userController.getTeachers);
userRoutes.get('/teachers/statistics', requireMinRole('manager'), userController.getTeachersStatistics);
userRoutes.get('/teachers/statistics/export', requireMinRole('manager'), userController.exportTeachersStatistics);
userRoutes.get('/teachers/sales-data', requireMinRole('manager'), userController.getTeachersSalesData);
userRoutes.get('/teachers/sales-data/export', requireMinRole('manager'), userController.exportTeachersSalesData);
// 新增端点 - 匹配前端调用
// staff及以上角色可以访问，控制器内已做数据隔离
userRoutes.get('/coach-statistics', requireMinRole('staff'), userController.getCoachStatistics);
userRoutes.get('/sales-statistics', requireMinRole('staff'), userController.getSalesStatistics);

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
userRoutes.delete('/:id', requireMinRole('manager'), userController.deleteUser);

