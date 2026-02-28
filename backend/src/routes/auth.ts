import { Router } from 'express';
import { authController, registerValidation, loginValidation, sendOtpValidation, verifyOtpValidation, loginByPhoneValidation, registerByPhoneValidation, resetPasswordValidation } from '../controllers/authController';
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
authRoutes.post('/create-manager', authenticate, requireMemFireAdmin, authController.createManager);

/**
 * @swagger
 * /api/auth/create-manager-phone:
 *   post:
 *     summary: 使用手机号创建机构管理者
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
 *               - phone
 *               - password
 *               - name
 *               - organizationId
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 手机号
 *               password:
 *                 type: string
 *                 description: 密码
 *               name:
 *                 type: string
 *               organizationId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 管理者创建成功
 */
authRoutes.post('/create-manager-phone', authenticate, requireMemFireAdmin, authController.createManagerByPhone);

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
authRoutes.post('/create-staff', authenticate, requireMemFireAdminOrManager, authController.createStaff);

/**
 * @swagger
 * /api/auth/create-parent:
 *   post:
 *     summary: 创建家长账号（与学员关联）
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
 *               - name
 *               - phone
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *                 description: 可选，默认为 123456
 *               name:
 *                 type: string
 *                 description: 家长姓名
 *               phone:
 *                 type: string
 *                 description: 家长电话（用于关联学员）
 *               studentId:
 *                 type: string
 *                 description: 可选，关联的学员ID，会自动更新学员的parentPhone
 *               organizationId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 家长账号创建成功
 */
authRoutes.post('/create-parent', authenticate, authController.createParent);

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: 发送手机验证码
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 中国大陆手机号
 *     responses:
 *       200:
 *         description: 验证码已发送
 */
authRoutes.post('/send-otp', sendOtpValidation, authController.sendOtp);

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: 验证码登录（手机号）
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - token
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 中国大陆手机号
 *               token:
 *                 type: string
 *                 description: 短信验证码
 *     responses:
 *       200:
 *         description: 登录成功
 */
authRoutes.post('/verify-otp', verifyOtpValidation, authController.verifyOtpLogin);

/**
 * @swagger
 * /api/auth/login-phone:
 *   post:
 *     summary: 手机号+密码登录
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 中国大陆手机号
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 */
authRoutes.post('/login-phone', loginByPhoneValidation, authController.loginByPhone);

/**
 * @swagger
 * /api/auth/register-phone:
 *   post:
 *     summary: 手机号+密码注册
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - password
 *               - name
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 中国大陆手机号
 *               password:
 *                 type: string
 *                 description: 至少6位
 *               name:
 *                 type: string
 *               smsCode:
 *                 type: string
 *                 description: 短信验证码（可选）
 *               organizationId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 注册成功
 */
authRoutes.post('/register-phone', registerByPhoneValidation, authController.registerByPhone);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: 重置密码（通过手机验证码）
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - token
 *               - newPassword
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 中国大陆手机号
 *               token:
 *                 type: string
 *                 description: 短信验证码
 *               newPassword:
 *                 type: string
 *                 description: 新密码（至少6位）
 *     responses:
 *       200:
 *         description: 密码重置成功
 */
authRoutes.post('/reset-password', resetPasswordValidation, authController.resetPassword);
