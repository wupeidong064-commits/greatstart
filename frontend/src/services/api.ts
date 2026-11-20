import axios from 'axios';
import { isCurrentBrowserSession, useAuthStore } from '../store/authStore';
import { publishHandoverChange } from './handoverChanges';
import { publishFollowUpChange } from './followUpChanges';

// 优先使用环境变量；默认同源 /api，开发环境由 Vite 代理。
const baseURL = import.meta.env.VITE_API_BASE || '/api';

const api = axios.create({
  baseURL,
  timeout: 60000, // 增加超时时间到60秒（蜜月期等API较慢）
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      if (!isCurrentBrowserSession(token)) throw new axios.CanceledError('账号会话已变化，请重新打开页面');
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
// 把 axios 的英文默认报错（"Request failed with status code 404" / "Network Error" 等）翻成中文解释。
// 各页面取错误信息的顺序都是先取后端返回的 message（业务报错本就是中文），最后才落到 error.message，
// 所以这里只覆盖最后的兜底展示；原始英文保留在 error.technicalMessage 供排查。
const friendlyErrorText = (error: any): string => {
  const status = error.response?.status;
  if (!error.response) {
    if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试';
    return '网络连接失败，请检查网络后重试';
  }
  switch (status) {
    case 400: return '请求内容有误（400），请检查后重试';
    case 401: return '登录已过期或未登录（401），请重新登录';
    case 403: return '没有权限执行此操作（403）';
    case 404: return '请求的功能不存在（404），请刷新页面后再试';
    case 409: return '与其他记录冲突（409），请刷新后重试';
    case 429: return '操作太频繁（429），请稍后再试';
    case 500: return '服务器开小差了（500），请稍后重试';
    case 502:
    case 504: return '服务暂时不可用，请稍后重试';
    case 503: return '服务维护中（503），请稍后重试';
    default: return `请求失败（${status}），请稍后重试`;
  }
};

api.interceptors.response.use(
  (response) => {
    if (response.config.method === 'put' && response.data?.success === true && /\/follow-ups(?:[/?#]|$)/.test(response.config.url || '')) {
      publishFollowUpChange(axios.AxiosHeaders.from(response.config.headers).get('Authorization'), response.data?.data?.day);
    }
    if (response.config.method === 'post' && response.data?.success === true &&
        /\/resource-transfers\/(?:(?:followup|dormant)\/)?execute(?:-batch)?(?:[/?#]|$)/.test(response.config.url || '')) {
      publishHandoverChange((response.config.url || '').includes('/dormant/') ? 'dormant-handover' : (response.config.url || '').includes('/followup/') ? 'followup-handover' : 'class-handover',
        axios.AxiosHeaders.from(response.config.headers).get('Authorization'));
    }
    if (['post', 'put', 'patch', 'delete'].includes(response.config.method || '') && /\/(students|classes|attendances|conversions|experience-lessons|payments|refunds|enrollments|leads|schedules|lesson-logs)(\/|$)/.test(response.config.url || '')) {
      window.dispatchEvent(new Event('business-data-changed'));
    }
    if (['put','post','delete'].includes(response.config.method || '') && /\/(users|organizations)(\/|$)/.test(response.config.url || '')) {
      window.dispatchEvent(new Event('permissions-changed'));
      try { localStorage.setItem('buzzer-permission-notice', String(Date.now())); } catch { /* Storage may be unavailable. */ }
    }
    return response.data;
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);
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
      const requestAuthorization = axios.AxiosHeaders.from(error.config?.headers).get('Authorization');
      // A late 401 from a previous session/token must not log out the current session.
      if (token && requestAuthorization === `Bearer ${token}`) {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }
    // 报错中文化（2026-11-07 用户要求）：后端给了业务 message 时页面会优先展示业务文案，这里只兜底。
    error.technicalMessage = error.message;
    error.message = friendlyErrorText(error);
    return Promise.reject(error);
  }
);

export default api;

