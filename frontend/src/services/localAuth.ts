import api from './api';

export const localAuth = {
  async changePassword(oldPassword: string, newPassword: string) {
    try {
      const response = await api.post('/auth/change-password', { oldPassword, newPassword });
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message || '密码修改失败' };
    }
  },
};
