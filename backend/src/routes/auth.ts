import { Router } from 'express';
import { authController, registerValidation, loginValidation } from '../controllers/authController';
import { authenticate, authenticateMemFire, requireMemFireAdmin, requireMemFireAdminOrManager } from '../middleware/auth';

export const authRoutes = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: 用户注册
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, manager, teacher, staff, parent]
 *               organizationId:
 *                 type: string
 *               campusId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 注册成功
 */
authRoutes.post('/register', registerValidation, authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 */
authRoutes.post('/login', loginValidation, authController.login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 用户信息
 */
authRoutes.get('/me', authenticate, authController.getMe);

/**
 * @swagger
 * /api/auth/create-manager:
 *   post:
 *     summary: 创建机构管理者
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - organizationId
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               organizationId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 管理者创建成功
 */
authRoutes.post('/create-manager', authenticateMemFire, requireMemFireAdmin, authController.createManager);

/**
 * @swagger
 * /api/auth/create-staff:
 *   post:
 *     summary: 创建工作人员（教练、销售、教师等）
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [coach, sales, teacher, staff]
 *               phone:
 *                 type: string
 *               group:
 *                 type: string
 *               organizationId:
 *                 type: string
 *               campusId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 工作人员创建成功
 */
authRoutes.post('/create-staff', authenticateMemFire, requireMemFireAdminOrManager, authController.createStaff);

