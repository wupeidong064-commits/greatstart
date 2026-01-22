import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import prisma from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const authController = {
  register: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new ApiError('验证失败', 400, 'VALIDATION_ERROR'));
      }

      const { email, password, name, role, organizationId, campusId, phone } = req.body;

      // 检查邮箱是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return next(new ApiError('邮箱已被注册', 400, 'EMAIL_EXISTS'));
      }

      // 验证角色
      const validRoles = ['admin', 'manager', 'teacher', 'staff', 'parent'];
      if (!validRoles.includes(role)) {
        return next(new ApiError('无效的角色', 400, 'INVALID_ROLE'));
      }

      // 如果是非admin角色，必须指定organizationId
      if (role !== 'admin' && !organizationId) {
        return next(new ApiError('非管理员角色必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 验证机构是否存在
      if (organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
        });
        if (!org) {
          return next(new ApiError('机构不存在', 400, 'ORGANIZATION_NOT_FOUND'));
        }
      }

      // 验证校区是否存在
      if (campusId) {
        const campus = await prisma.campus.findUnique({
          where: { id: campusId },
        });
        if (!campus || campus.organizationId !== organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(password, 10);

      // 创建用户
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
          organizationId,
          campusId,
          phone,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          campusId: true,
          createdAt: true,
        },
      });

      sendSuccess(res, user, '注册成功', 201);
    } catch (error) {
      next(error);
    }
  },

  login: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new ApiError('验证失败', 400, 'VALIDATION_ERROR'));
      }

      const { email, password } = req.body;

      // 查找用户
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          campus: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      if (!user) {
        return next(new ApiError('邮箱或密码错误', 401, 'INVALID_CREDENTIALS'));
      }

      if (!user.isActive) {
        return next(new ApiError('账户已被禁用', 403, 'ACCOUNT_DISABLED'));
      }

      // 验证密码
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return next(new ApiError('邮箱或密码错误', 401, 'INVALID_CREDENTIALS'));
      }

      // 更新最后登录时间
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // 生成JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      sendSuccess(res, {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
          organization: user.organization,
          campus: user.campus,
        },
      }, '登录成功');
    } catch (error) {
      next(error);
    }
  },

  getMe: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          campus: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          organizationId: true,
          campusId: true,
          organization: true,
          campus: true,
          createdAt: true,
          lastLoginAt: true,
        },
      });

      if (!user) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  },
};

// 注册验证规则
export const registerValidation = [
  body('email').isEmail().withMessage('无效的邮箱地址'),
  body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('name').notEmpty().withMessage('姓名不能为空'),
  body('role').isIn(['admin', 'manager', 'teacher', 'staff', 'parent']).withMessage('无效的角色'),
];

export const loginValidation = [
  body('email').isEmail().withMessage('无效的邮箱地址'),
  body('password').notEmpty().withMessage('密码不能为空'),
];

