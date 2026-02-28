import api from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginByPhoneRequest {
  phone: string;
  password: string;
}

export interface SendOtpRequest {
  phone: string;
}

export interface VerifyOtpRequest {
  phone: string;
  token: string;
}

export interface RegisterByPhoneRequest {
  phone: string;
  password: string;
  name: string;
  smsCode?: string;
  organizationId?: string;
}

export interface ResetPasswordRequest {
  phone: string;
  token: string;
  newPassword: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role: string;
  organizationId?: string;
  campusId?: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    token: string;
    user: {
      id: string;
      email?: string;
      phone?: string;
      name: string;
      role: string;
      organizationId?: string;
      campusId?: string;
      organization?: any;
      campus?: any;
    };
  };
  message?: string;
}

export const authService = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    return api.post('/auth/login', data);
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    return api.post('/auth/register', data);
  },

  getMe: async () => {
    return api.get('/auth/me');
  },

  // 发送手机验证码
  sendOtp: async (data: SendOtpRequest): Promise<{ success: boolean; message?: string }> => {
    return api.post('/auth/send-otp', data);
  },

  // 验证码登录
  verifyOtp: async (data: VerifyOtpRequest): Promise<AuthResponse> => {
    return api.post('/auth/verify-otp', data);
  },

  // 手机号+密码登录
  loginByPhone: async (data: LoginByPhoneRequest): Promise<AuthResponse> => {
    return api.post('/auth/login-phone', data);
  },

  // 手机号+密码注册
  registerByPhone: async (data: RegisterByPhoneRequest): Promise<AuthResponse> => {
    return api.post('/auth/register-phone', data);
  },

  // 重置密码（通过手机验证码）
  resetPassword: async (data: ResetPasswordRequest): Promise<{ success: boolean; message?: string }> => {
    return api.post('/auth/reset-password', data);
  },
};

