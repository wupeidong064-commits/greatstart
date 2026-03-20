import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import prisma from '../config/database';
import { memfireAdmin } from '../config/memfire';
import { generateSecurePassword, securityConfig } from '../config/security';
import { logOperation, logger } from '../middleware/logger';

// Helper to get JWT_SECRET from environment
const getJWTSecret = () => process.env.JWT_SECRET || 'your-secret-key';

// 手机号验证正则（中国大陆手机号）
const PHONE_REGEX = /^1[3-9]\d{9}$/;
const isPhoneNumber = (value: string): boolean => PHONE_REGEX.test(value);

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
      const clientIp = req.ip || req.socket.remoteAddress;

      // 使用直接 fetch 调用 MemFire Auth API 进行身份验证
      // 注意：登录认证需要使用 anon key，而不是 service_role key
      const anonKey = process.env.MEMFIRE_ANON_KEY || '';
      const serviceKey = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';
      const envUrl = process.env.MEMFIRE_URL || '';

      const authResponse = await fetch(`${envUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const authData = await authResponse.json() as { user?: { id: string }; access_token?: string };

      if (!authResponse.ok || !authData.user) {
        logger.warn('登录失败', { email, ip: clientIp, reason: 'invalid_credentials' });
        return next(new ApiError('邮箱或密码错误', 401, 'INVALID_CREDENTIALS'));
      }

      // 使用直接 fetch 从 users 表获取用户的角色和机构信息（使用 service_role key）
      // 只查询需要的字段，避免返回多余的或并使用驼峰格式
      const userResponse = await fetch(
        `${envUrl}/rest/v1/users?id=eq.${authData.user!.id}&select=id,email,phone,name,role,organization_id,campus_id,created_at,updated_at,is_active,last_login_at`,
        {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const users = await userResponse.json();
      const rawUser = Array.isArray(users) && users.length > 0 ? users[0] : null;

      // 将数据库字段转换为驼峰格式
      const user = {
        id: rawUser.id,
        email: rawUser.email,
        phone: rawUser.phone,
        name: rawUser.name,
        role: rawUser.role,
        organizationId: rawUser.organization_id,
        campusId: rawUser.campus_id,
        isActive: rawUser.is_active,
        createdAt: rawUser.created_at,
        updatedAt: rawUser.updated_at,
        lastLoginAt: rawUser.last_login_at,
      };

      if (!user) {
        logger.warn('登录失败', { email, ip: clientIp, reason: 'user_not_found' });
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      if (!user.isActive) {
        logger.warn('登录失败', { email, ip: clientIp, reason: 'account_disabled' });
        return next(new ApiError('账户已被禁用', 403, 'ACCOUNT_DISABLED'));
      }

      // 获取关联的机构信息
      let organization = null;
      let campus = null;

      if (user.organizationId) {
        const orgResponse = await fetch(
          `${envUrl}/rest/v1/organizations?id=eq.${user.organizationId}&select=id,name,code`,
          {
            headers: {
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
            },
          }
        );
        const orgs = await orgResponse.json();
        organization = Array.isArray(orgs) && orgs.length > 0 ? orgs[0] : null;
      }

      if (user.campusId) {
        const campusResponse = await fetch(
          `${envUrl}/rest/v1/campuses?id=eq.${user.campusId}&select=id,name,code`,
          {
            headers: {
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
            },
          }
        );
        const campuses = await campusResponse.json();
        campus = Array.isArray(campuses) && campuses.length > 0 ? campuses[0] : null;
      }

      // 生成JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
        },
        securityConfig.jwt.secret,
        { expiresIn: securityConfig.jwt.expiresIn }
      );

      // 更新最后登录时间
      await fetch(
        `${envUrl}/rest/v1/users?id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ lastLoginAt: new Date().toISOString() }),
        }
      );

      // 记录登录成功
      logOperation('user_login', user.id, {
        email: user.email,
        role: user.role,
        ip: clientIp,
        organizationId: user.organizationId,
      });

      sendSuccess(res, {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
          organization,
          campus,
        },
      }, '登录成功');
    } catch (error) {
      next(error);
    }
  },

  getMe: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user || req.memfireUser;

      if (!currentUser) {
        return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
      }

      // 从 users 表获取用户信息
      const { data: user, error: userError } = await memfireAdmin
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (userError || !user) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      // 获取关联的机构信息
      let organization = null;
      let campus = null;

      if (user.organizationId) {
        const { data: org } = await memfireAdmin
          .from('organizations')
          .select('id, name, code')
          .eq('id', user.organizationId)
          .maybeSingle();
        organization = org;
      }

      if (user.campusId) {
        const { data: camp } = await memfireAdmin
          .from('campuses')
          .select('id, name, code')
          .eq('id', user.campusId)
          .maybeSingle();
        campus = camp;
      }

      sendSuccess(res, {
        ...user,
        organization,
        campus,
      });
    } catch (error) {
      next(error);
    }
  },

  // 发送手机验证码
  sendOtp: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phone } = req.body;

      if (!phone || !isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      // 使用 MemFire 发送验证码
      const { error } = await memfireAdmin.auth.signInWithOtp({
        phone,
        options: {
          shouldCreateUser: true, // 如果用户不存在则自动创建
        },
      });

      if (error) {
        logger.error('发送验证码失败', { phone, error: error.message });
        return next(new ApiError('发送验证码失败: ' + error.message, 400, 'SEND_OTP_ERROR'));
      }

      sendSuccess(res, null, '验证码已发送');
    } catch (error) {
      next(error);
    }
  },

  // 验证码登录（手机号）
  verifyOtpLogin: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phone, token } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;

      if (!phone || !isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      if (!token) {
        return next(new ApiError('请输入验证码', 400, 'MISSING_TOKEN'));
      }

      // 使用 MemFire 验证验证码
      const { data: authData, error: authError } = await memfireAdmin.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (authError || !authData.user) {
        logger.warn('验证码登录失败', { phone, ip: clientIp, reason: 'invalid_otp' });
        return next(new ApiError('验证码错误或已过期', 401, 'INVALID_OTP'));
      }

      // 从 users 表获取用户的角色和机构信息
      let { data: user, error: userError } = await memfireAdmin
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      // 如果用户在 users 表中不存在，自动创建（新用户首次登录）
      if (!user) {
        const { data: newUser, error: createError } = await memfireAdmin
          .from('users')
          .insert({
            id: authData.user.id,
            phone,
            name: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'), // 默认用户名用脱敏手机号
            role: 'parent', // 默认角色
            isActive: true,
            isPhoneUser: true,
          })
          .select()
          .maybeSingle();

        if (createError) {
          logger.error('创建用户失败', { phone, error: createError.message });
          return next(new ApiError('创建用户失败', 500, 'USER_CREATE_ERROR'));
        }
        user = newUser;
      }

      if (!user.isActive) {
        logger.warn('登录失败', { phone, ip: clientIp, reason: 'account_disabled' });
        return next(new ApiError('账户已被禁用', 403, 'ACCOUNT_DISABLED'));
      }

      // 获取关联的机构信息
      let organization = null;
      let campus = null;

      if (user.organizationId) {
        const { data: org } = await memfireAdmin
          .from('organizations')
          .select('id, name, code')
          .eq('id', user.organizationId)
          .maybeSingle();
        organization = org;
      }

      if (user.campusId) {
        const { data: camp } = await memfireAdmin
          .from('campuses')
          .select('id, name, code')
          .eq('id', user.campusId)
          .maybeSingle();
        campus = camp;
      }

      // 生成JWT token
      const jwtToken = jwt.sign(
        {
          userId: user.id,
          phone: user.phone,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
        },
        securityConfig.jwt.secret,
        { expiresIn: securityConfig.jwt.expiresIn }
      );

      // 更新最后登录时间
      await memfireAdmin
        .from('users')
        .update({ lastLoginAt: new Date().toISOString() })
        .eq('id', user.id);

      // 记录登录成功
      logOperation('user_login_otp', user.id, {
        phone: user.phone,
        role: user.role,
        ip: clientIp,
        organizationId: user.organizationId,
      });

      sendSuccess(res, {
        token: jwtToken,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
          organization,
          campus,
        },
      }, '登录成功');
    } catch (error) {
      next(error);
    }
  },

  // 手机号+密码登录
  loginByPhone: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phone, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;

      if (!phone || !isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      if (!password) {
        return next(new ApiError('请输入密码', 400, 'MISSING_PASSWORD'));
      }

      // 使用 MemFire Auth 进行身份验证
      const { data: authData, error: authError } = await memfireAdmin.auth.signInWithPassword({
        phone,
        password,
      });

      if (authError || !authData.user) {
        logger.warn('手机号登录失败', { phone, ip: clientIp, reason: 'invalid_credentials' });
        return next(new ApiError('手机号或密码错误', 401, 'INVALID_CREDENTIALS'));
      }

      // 从 users 表获取用户的角色和机构信息
      const { data: user, error: userError } = await memfireAdmin
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (userError || !user) {
        logger.warn('手机号登录失败', { phone, ip: clientIp, reason: 'user_not_found' });
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      if (!user.isActive) {
        logger.warn('手机号登录失败', { phone, ip: clientIp, reason: 'account_disabled' });
        return next(new ApiError('账户已被禁用', 403, 'ACCOUNT_DISABLED'));
      }

      // 获取关联的机构信息
      let organization = null;
      let campus = null;

      if (user.organizationId) {
        const { data: org } = await memfireAdmin
          .from('organizations')
          .select('id, name, code')
          .eq('id', user.organizationId)
          .maybeSingle();
        organization = org;
      }

      if (user.campusId) {
        const { data: camp } = await memfireAdmin
          .from('campuses')
          .select('id, name, code')
          .eq('id', user.campusId)
          .maybeSingle();
        campus = camp;
      }

      // 生成JWT token
      const jwtToken = jwt.sign(
        {
          userId: user.id,
          phone: user.phone,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
        },
        securityConfig.jwt.secret,
        { expiresIn: securityConfig.jwt.expiresIn }
      );

      // 更新最后登录时间
      await memfireAdmin
        .from('users')
        .update({ lastLoginAt: new Date().toISOString() })
        .eq('id', user.id);

      // 记录登录成功
      logOperation('user_login_phone', user.id, {
        phone: user.phone,
        role: user.role,
        ip: clientIp,
        organizationId: user.organizationId,
      });

      sendSuccess(res, {
        token: jwtToken,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          campusId: user.campusId,
          organization,
          campus,
        },
      }, '登录成功');
    } catch (error) {
      next(error);
    }
  },

  // 手机号+密码注册
  registerByPhone: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phone, password, name, smsCode, organizationId } = req.body;

      if (!phone || !isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      if (!password || password.length < 6) {
        return next(new ApiError('密码至少6位', 400, 'INVALID_PASSWORD'));
      }

      if (!name) {
        return next(new ApiError('请输入姓名', 400, 'MISSING_NAME'));
      }

      // 验证短信验证码（如果有）
      if (smsCode) {
        const { error: verifyError } = await memfireAdmin.auth.verifyOtp({
          phone,
          token: smsCode,
          type: 'sms',
        });

        if (verifyError) {
          return next(new ApiError('验证码错误或已过期', 400, 'INVALID_SMS_CODE'));
        }
      }

      // 检查手机号是否已存在
      const { data: existingUser } = await memfireAdmin
        .from('users')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      if (existingUser) {
        return next(new ApiError('手机号已被注册', 400, 'PHONE_EXISTS'));
      }

      // 使用 MemFire Auth 注册用户
      const { data: authData, error: authError } = await memfireAdmin.auth.signUp({
        phone,
        password,
        options: {
          data: {
            name,
          },
        },
      });

      if (authError) {
        if (authError.message.includes('already exists') || authError.message.includes('already been registered')) {
          return next(new ApiError('手机号已被注册', 400, 'PHONE_EXISTS'));
        }
        return next(new ApiError(authError.message, 400, 'AUTH_ERROR'));
      }

      if (!authData.user) {
        return next(new ApiError('注册失败', 500, 'REGISTER_ERROR'));
      }

      // 在 users 表中创建记录
      const { error: userError } = await memfireAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          phone,
          name,
          role: 'parent', // 默认角色
          organizationId: organizationId || null,
          isActive: true,
          isPhoneUser: true,
        });

      if (userError) {
        // 如果 users 表操作失败，尝试回滚 MemFire Auth 用户
        await memfireAdmin.auth.admin.deleteUser(authData.user.id);
        return next(new ApiError('创建用户失败: ' + userError.message, 500, 'USER_CREATE_ERROR'));
      }

      // 生成JWT token
      const jwtToken = jwt.sign(
        {
          userId: authData.user.id,
          phone,
          role: 'parent',
          organizationId: organizationId || null,
        },
        securityConfig.jwt.secret,
        { expiresIn: securityConfig.jwt.expiresIn }
      );

      sendSuccess(res, {
        token: jwtToken,
        user: {
          id: authData.user.id,
          phone,
          name,
          role: 'parent',
          organizationId: organizationId || null,
        },
      }, '注册成功', 201);
    } catch (error) {
      next(error);
    }
  },

  // 重置密码（通过手机验证码）
  resetPassword: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phone, token, newPassword } = req.body;

      // 验证必填字段
      if (!phone || !token || !newPassword) {
        return next(new ApiError('缺少必填字段', 400, 'MISSING_FIELDS'));
      }

      // 验证手机号格式
      if (!isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      // 验证密码长度
      if (newPassword.length < 6) {
        return next(new ApiError('密码至少6位', 400, 'INVALID_PASSWORD'));
      }

      // 1. 验证手机验证码
      const { data: authData, error: otpError } = await memfireAdmin.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (otpError || !authData.user) {
        console.log('[resetPassword] 验证码验证失败:', otpError);
        return next(new ApiError('验证码错误或已过期', 400, 'INVALID_OTP'));
      }

      // 2. 更新密码（使用 Admin API）
      const { error: updateError } = await memfireAdmin.auth.admin.updateUserById(
        authData.user.id,
        { password: newPassword }
      );

      if (updateError) {
        console.log('[resetPassword] 更新密码失败:', updateError);
        return next(new ApiError('重置密码失败', 500, 'UPDATE_PASSWORD_ERROR'));
      }

      console.log('[resetPassword] 密码重置成功:', phone);

      sendSuccess(res, { success: true }, '密码重置成功');
    } catch (error) {
      next(error);
    }
  },

  // 创建机构管理者（使用 MemFire Admin API，自动确认邮箱）
  createManager: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, organizationId } = req.body;

      // 验证必填字段
      if (!email || !password || !name || !organizationId) {
        return next(new ApiError('缺少必填字段', 400, 'MISSING_FIELDS'));
      }

      // 验证机构是否存在（从 MemFire 查询）
      const { data: org, error: orgError } = await memfireAdmin
        .from('organizations')
        .select('id')
        .eq('id', organizationId)
        .maybeSingle();

      if (orgError || !org) {
        return next(new ApiError('机构不存在', 400, 'ORGANIZATION_NOT_FOUND'));
      }

      // 1. 使用 MemFire Admin API 创建用户（自动确认邮箱）
      const { data: authData, error: authError } = await memfireAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // 自动确认邮箱
        user_metadata: {
          name,
        },
      });

      if (authError) {
        // 邮箱已存在
        if (authError.message.includes('already exists')) {
          return next(new ApiError('邮箱已被注册', 400, 'EMAIL_EXISTS'));
        }
        return next(new ApiError(authError.message, 400, 'AUTH_ERROR'));
      }

      // 2. 在 users 表中创建记录（角色为 manager）
      const { error: userError } = await memfireAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          name,
          role: 'manager',
          organizationId,
        });

      if (userError) {
        // 如果 users 表操作失败，尝试回滚 MemFire Auth 用户
        await memfireAdmin.auth.admin.deleteUser(authData.user.id);
        return next(new ApiError('创建用户失败: ' + userError.message, 500, 'USER_CREATE_ERROR'));
      }

      sendSuccess(
        res,
        {
          id: authData.user.id,
          email: authData.user.email,
          name,
          role: 'manager',
          organizationId,
        },
        '管理者创建成功',
        201
      );
    } catch (error) {
      next(error);
    }
  },

  // 创建机构管理者（使用手机号）
  createManagerByPhone: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phone, password, name, organizationId } = req.body;

      // 验证必填字段
      if (!phone || !password || !name || !organizationId) {
        return next(new ApiError('缺少必填字段（手机号、密码、姓名、机构）', 400, 'MISSING_FIELDS'));
      }

      // 验证手机号格式
      if (!isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      // 验证机构是否存在
      const { data: org, error: orgError } = await memfireAdmin
        .from('organizations')
        .select('id')
        .eq('id', organizationId)
        .maybeSingle();

      if (orgError || !org) {
        return next(new ApiError('机构不存在', 400, 'ORGANIZATION_NOT_FOUND'));
      }

      // 1. 使用 MemFire Admin API 创建用户（使用手机号）
      const { data: authData, error: authError } = await memfireAdmin.auth.admin.createUser({
        phone,
        password,
        phone_confirm: true, // 自动确认手机号
        user_metadata: {
          name,
        },
      });

      if (authError) {
        logger.error('MemFire Auth 创建用户失败', { phone, error: authError.message, code: authError.status });
        // 手机号已存在
        if (authError.message.includes('already exists') || authError.message.includes('already been registered')) {
          return next(new ApiError('手机号已被注册', 400, 'PHONE_EXISTS'));
        }
        return next(new ApiError('创建用户失败: ' + authError.message, 400, 'AUTH_ERROR'));
      }

      // 2. 在 users 表中创建记录（角色为 manager）
      const { error: userError } = await memfireAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          phone: authData.user.phone,
          name,
          role: 'manager',
          organizationId,
          isActive: true,
          isPhoneUser: true,
        });

      if (userError) {
        // 如果 users 表操作失败，尝试回滚 MemFire Auth 用户
        await memfireAdmin.auth.admin.deleteUser(authData.user.id);
        return next(new ApiError('创建用户失败: ' + userError.message, 500, 'USER_CREATE_ERROR'));
      }

      sendSuccess(
        res,
        {
          id: authData.user.id,
          phone: authData.user.phone,
          name,
          role: 'manager',
          organizationId,
        },
        '管理者创建成功',
        201
      );
    } catch (error) {
      next(error);
    }
  },

  // 创建工作人员（教练、销售等），使用 MemFire Admin API 自动确认邮箱
  createStaff: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, role, phone, group, organizationId, campusId } = req.body;

      // 验证必填字段（password 可选，未提供时自动生成；email 必填）
      if (!name || !role || !email) {
        return next(new ApiError('缺少必填字段（姓名、角色、邮箱）', 400, 'MISSING_FIELDS'));
      }

      // 验证手机号格式（如果提供了手机号）
      if (phone && !isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      // 如果未提供密码，使用默认密码 123456
      const finalPassword = password || '123456';

      // 验证角色：只允许创建 staff、coach、sales、teacher 等非管理员角色
      const allowedRoles = ['coach', 'sales', 'teacher', 'staff'];
      if (!allowedRoles.includes(role)) {
        return next(new ApiError('无效的角色，只能创建教练、销售、教师等工作人员', 400, 'INVALID_ROLE'));
      }

      // 如果未指定 organizationId，使用当前用户的（支持 req.user 和 req.memfireUser）
      const finalOrganizationId = organizationId || req.memfireUser?.organizationId || req.user?.organizationId;
      if (!finalOrganizationId) {
        return next(new ApiError('缺少机构信息', 400, 'MISSING_ORGANIZATION'));
      }

      // 验证机构是否存在
      const { data: org, error: orgError } = await memfireAdmin
        .from('organizations')
        .select('id')
        .eq('id', finalOrganizationId)
        .maybeSingle();

      if (orgError || !org) {
        return next(new ApiError('机构不存在', 400, 'ORGANIZATION_NOT_FOUND'));
      }

      // 业务逻辑：校区管理者和系统管理员创建工作人员时，自动继承创建者的校区
      let finalCampusId = campusId;
      const currentUserRole = req.memfireUser?.role || req.user?.role;
      const currentUserCampusId = req.memfireUser?.campusId || req.user?.campusId;

      // 如果当前用户是 manager 或 admin，且有校区，则新工作人员继承该校区
      if ((currentUserRole === 'manager' || currentUserRole === 'admin') && currentUserCampusId) {
        finalCampusId = currentUserCampusId;
      }

      // 如果指定了 campusId（非 manager/admin 创建时），验证校区是否存在
      if (finalCampusId && finalCampusId !== currentUserCampusId) {
        const { data: campus, error: campusError } = await memfireAdmin
          .from('campuses')
          .select('id, organizationId')
          .eq('id', finalCampusId)
          .maybeSingle();

        if (campusError || !campus) {
          return next(new ApiError('校区不存在', 400, 'CAMPUS_NOT_FOUND'));
        }
        if (campus.organizationId !== finalOrganizationId) {
          return next(new ApiError('校区不属于该机构', 400, 'CAMPUS_MISMATCH'));
        }
      }

      // 1. 使用 MemFire Admin API 创建用户（使用邮箱）
      const createUserData: any = {
        email,
        password: finalPassword,
        email_confirm: true, // 自动确认邮箱
        user_metadata: {
          name,
        },
      };

      const { data: authData, error: authError } = await memfireAdmin.auth.admin.createUser(createUserData);

      if (authError) {
        // 邮箱已存在
        if (authError.message.includes('already exists') || authError.message.includes('already been registered')) {
          return next(new ApiError('邮箱已被注册', 400, 'USER_EXISTS'));
        }
        return next(new ApiError(authError.message, 400, 'AUTH_ERROR'));
      }

      // 2. 在 users 表中创建记录
      const { error: userError } = await memfireAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          email: authData.user.email || email,
          phone: phone || null,
          name,
          role,
          organizationId: finalOrganizationId,
          campusId: finalCampusId || null,
          group: group || null,
          isActive: true,
        });

      if (userError) {
        // 如果 users 表操作失败，尝试回滚 MemFire Auth 用户
        await memfireAdmin.auth.admin.deleteUser(authData.user.id);
        return next(new ApiError('创建用户失败: ' + userError.message, 500, 'USER_CREATE_ERROR'));
      }

      // 记录用户创建操作
      logOperation('user_created', req.memfireUser?.id || req.user?.id, {
        newUserId: authData.user.id,
        email,
        role,
        organizationId: finalOrganizationId,
      });

      sendSuccess(
        res,
        {
          id: authData.user.id,
          email: authData.user.email,
          name,
          role,
          organizationId: finalOrganizationId,
          campusId: finalCampusId,
          phone,
          defaultPassword: finalPassword,
        },
        '工作人员创建成功',
        201
      );
    } catch (error) {
      next(error);
    }
  },

  // 创建家长/学员账号（与学员关联），使用 MemFire Auth
  createParent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, phone, studentId, organizationId } = req.body;

      console.log('[createParent] 收到创建家长账号请求:', { email, name, phone, studentId, organizationId });

      // 验证必填字段（email 必填，phone 可选）
      if (!name || !email) {
        console.log('[createParent] 缺少必填字段');
        return next(new ApiError('缺少必填字段（姓名、邮箱）', 400, 'MISSING_FIELDS'));
      }

      // 验证手机号格式（如果提供了手机号）
      if (phone && !isPhoneNumber(phone)) {
        return next(new ApiError('请输入有效的手机号', 400, 'INVALID_PHONE'));
      }

      // 如果未提供密码，使用默认密码 123456
      const finalPassword = password || '123456';

      // 从认证用户信息中获取 organizationId（支持 user 或 memfireUser）
      const finalOrganizationId = organizationId || req.user?.organizationId || req.memfireUser?.organizationId;
      if (!finalOrganizationId) {
        console.log('[createParent] 缺少机构信息');
        return next(new ApiError('缺少机构信息', 400, 'MISSING_ORGANIZATION'));
      }

      console.log('[createParent] 使用机构ID:', finalOrganizationId);

      // 验证机构是否存在（从 MemFire 查询）
      const { data: org, error: orgError } = await memfireAdmin
        .from('organizations')
        .select('id')
        .eq('id', finalOrganizationId)
        .maybeSingle();

      if (orgError || !org) {
        console.log('[createParent] 机构不存在或查询失败:', orgError);
        return next(new ApiError('机构不存在', 400, 'ORGANIZATION_NOT_FOUND'));
      }

      console.log('[createParent] 机构验证通过');

      // 如果指定了 studentId，验证学员是否存在且属于该机构
      if (studentId) {
        const { data: student } = await memfireAdmin
          .from('students')
          .select('*')
          .eq('id', studentId)
          .eq('organizationId', finalOrganizationId)
          .maybeSingle();

        if (!student) {
          console.log('[createParent] 学员不存在');
          return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
        }

        // 更新学员的家长电话，确保关联
        console.log('[createParent] 更新学员家长电话');
        await memfireAdmin
          .from('students')
          .update({ parentPhone: phone })
          .eq('id', studentId);
      }

      // 1. 使用 MemFire Admin API 创建用户（使用邮箱）
      console.log('[createParent] 开始在 MemFire Auth 创建用户...');
      const createUserData: any = {
        email,
        password: finalPassword,
        email_confirm: true, // 自动确认邮箱
        user_metadata: {
          name,
        },
      };

      const { data: authData, error: authError } = await memfireAdmin.auth.admin.createUser(createUserData);

      if (authError) {
        console.log('[createParent] MemFire Auth 创建用户失败:', authError);
        // 邮箱已存在
        if (authError.message.includes('already exists') || authError.message.includes('already been registered')) {
          return next(new ApiError('邮箱已被注册', 400, 'USER_EXISTS'));
        }
        return next(new ApiError(authError.message, 400, 'AUTH_ERROR'));
      }

      console.log('[createParent] MemFire Auth 用户创建成功:', authData.user.id);

      // 2. 在 users 表中创建记录（角色为 parent）
      console.log('[createParent] 开始在 users 表创建记录...');

      // 直接使用 MemFire 客户端插入（避免 Prisma 连接问题）
      const { error: insertError } = await memfireAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          email: authData.user.email || email,
          phone: phone || null,
          name,
          role: 'parent',
          organizationId: finalOrganizationId,
        });

      if (insertError) {
        console.log('[createParent] users 表创建记录失败:', insertError);
        // 如果 users 表操作失败，尝试回滚 MemFire Auth 用户
        await memfireAdmin.auth.admin.deleteUser(authData.user.id);
        return next(new ApiError('创建用户失败: ' + insertError.message, 500, 'USER_CREATE_ERROR'));
      }

      console.log('[createParent] 家长账号创建完成');
      sendSuccess(
        res,
        {
          id: authData.user.id,
          email: authData.user.email,
          name,
          role: 'parent',
          phone,
          organizationId: finalOrganizationId,
          defaultPassword: finalPassword,
        },
        '家长账号创建成功',
        201
      );
    } catch (error) {
      console.log('[createParent] 未捕获的异常:', error);
      next(error);
    }
  },

  // 修改密码（通过后端 API）
  changePassword: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const currentUser = req.memfireUser || req.user;

      if (!currentUser) {
        return next(new ApiError('未认证', 401, 'UNAUTHORIZED'));
      }

      if (!oldPassword || !newPassword) {
        return next(new ApiError('缺少必填字段', 400, 'MISSING_FIELDS'));
      }

      if (newPassword.length < 6) {
        return next(new ApiError('新密码至少6位', 400, 'INVALID_PASSWORD'));
      }

      // 获取用户信息
      const { data: user, error: userError } = await memfireAdmin
        .from('users')
        .select('email, phone')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (userError || !user) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      // 验证原密码（使用邮箱或手机号登录）
      let authError;
      if (user.email) {
        const result = await memfireAdmin.auth.signInWithPassword({
          email: user.email,
          password: oldPassword,
        });
        authError = result.error;
      } else if (user.phone) {
        const result = await memfireAdmin.auth.signInWithPassword({
          phone: user.phone,
          password: oldPassword,
        });
        authError = result.error;
      } else {
        return next(new ApiError('用户信息不完整', 400, 'USER_INFO_INCOMPLETE'));
      }

      if (authError) {
        logger.warn('修改密码失败：原密码错误', { userId: currentUser.id });
        return next(new ApiError('原密码错误', 400, 'INVALID_OLD_PASSWORD'));
      }

      // 使用 Admin API 更新密码
      const { error: updateError } = await memfireAdmin.auth.admin.updateUserById(
        currentUser.id,
        { password: newPassword }
      );

      if (updateError) {
        logger.error('更新密码失败', { userId: currentUser.id, error: updateError.message });
        return next(new ApiError('密码修改失败: ' + updateError.message, 500, 'UPDATE_PASSWORD_ERROR'));
      }

      logger.info('密码修改成功', { userId: currentUser.id });
      sendSuccess(res, { success: true }, '密码修改成功');
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
  body('role').isIn(['admin', 'manager', 'teacher', 'coach', 'sales', 'staff', 'parent']).withMessage('无效的角色'),
];

export const loginValidation = [
  body('email').isEmail().withMessage('无效的邮箱地址'),
  body('password').notEmpty().withMessage('密码不能为空'),
];

// 手机号验证规则
export const sendOtpValidation = [
  body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
];

export const verifyOtpValidation = [
  body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
  body('token').notEmpty().withMessage('请输入验证码'),
];

export const loginByPhoneValidation = [
  body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
  body('password').notEmpty().withMessage('请输入密码'),
];

export const registerByPhoneValidation = [
  body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
  body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('name').notEmpty().withMessage('请输入姓名'),
];

export const resetPasswordValidation = [
  body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
  body('token').notEmpty().withMessage('请输入验证码'),
  body('newPassword').isLength({ min: 6 }).withMessage('密码至少6位'),
];

