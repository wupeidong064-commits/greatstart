import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// 优先使用环境变量指定的后端地址；开发环境走代理
const baseURL =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:3000/api');

const api = axios.create({
  baseURL,
  timeout: 60000, // 增加超时时间到60秒（蜜月期等API较慢）
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    // 401 错误时，只有在已登录状态下才清除认证并跳转
    // 以下情况不应触发登出：
    // 1. 登录请求失败
    // 2. 创建用户请求失败（创建家长、创建工作人员等）
    const url = error.config?.url || '';
    const isLoginRequest = url.includes('/auth/login');
    const isCreateUserRequest = url.includes('/auth/create-parent') ||
                                 url.includes('/auth/create-staff') ||
                                 url.includes('/auth/create-manager');

    if (error.response?.status === 401 && !isLoginRequest && !isCreateUserRequest) {
      const token = useAuthStore.getState().token;
      if (token) {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

