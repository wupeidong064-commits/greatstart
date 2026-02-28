import { memfire } from '../lib/memfire';
import api from './api';

if (!memfire) {
  // eslint-disable-next-line no-console
  console.warn('[MemFireAuth] memfire 客户端未初始化，认证功能不可用');
}

export interface MemfireProfile {
  id: string;
  email: string | null;
  name?: string | null;
  role?: string | null;
  organizationId?: string | null;
  campusId?: string | null;
}

export const memfireAuth = {
  // 注册
  async signUp(email: string, password: string, name: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) throw error;

    // 额外创建 public.users 资料（如果后端已建表）
    if (data.user) {
      try {
        await memfire
          .from('users')
          .insert({
            id: data.user.id,
            email: data.user.email,
            name,
          });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[MemFireAuth] 创建用户资料失败（可忽略）:', e);
      }
    }

    return data;
  },

  // 登录
  async signIn(email: string, password: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  // 登出
  async signOut() {
    if (!memfire) return;
    const { error } = await memfire.auth.signOut();
    if (error) throw error;
  },

  // 获取当前用户 + Profile
  async getCurrentUser(): Promise<MemfireProfile | null> {
    if (!memfire) return null;

    const {
      data: { user },
      error,
    } = await memfire.auth.getUser();

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[MemFireAuth] 获取当前用户失败:', error);
      return null;
    }

    if (!user) return null;

    try {
      const { data: profile } = await memfire
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      return {
        id: user.id,
        email: user.email ?? null,
        name: (user.user_metadata as any)?.name ?? profile?.name ?? null,
        role: (profile as any)?.role ?? null,
        organizationId: (profile as any)?.organizationId ?? null,
        campusId: (profile as any)?.campusId ?? null,
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[MemFireAuth] 获取用户 Profile 失败（可忽略）:', e);
      return {
        id: user.id,
        email: user.email ?? null,
        name: (user.user_metadata as any)?.name ?? null,
      };
    }
  },

  // 创建机构管理者
  async createManager(email: string, password: string, name: string, organizationId: string) {
    // 调用后端 API，使用 MemFire Admin API 创建用户（自动确认邮箱）
    const response = await api.post('/auth/create-manager', {
      email,
      password,
      name,
      organizationId,
    });

    return response;
  },

  // 修改密码（通过后端 API）
  async changePassword(oldPassword: string, newPassword: string) {
    try {
      const response = await api.post('/auth/change-password', {
        oldPassword,
        newPassword,
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message || '密码修改失败';
      return { success: false, error: errorMsg };
    }
  },

  // 忘记密码 - 发送重置密码邮件
  async resetPassword(email: string) {
    if (!memfire) throw new Error('MemFire 客户端未初始化');

    const { data, error } = await memfire.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      return { success: false, error: error.message || '发送邮件失败' };
    }

    return { success: true, data };
  },

  // 登出（已存在 signOut 方法，添加别名）
  async logout() {
    return this.signOut();
  },
};


