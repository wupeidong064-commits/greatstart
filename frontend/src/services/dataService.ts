/**
 * 数据服务 - 提供带缓存的数据获取方法
 *
 * 减少 API 调用次数，优化性能
 */

import api from './api';
import { cacheService, CACHE_KEYS, CACHE_TTL } from './cacheService';

// 教师数据类型
export interface Teacher {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

// 班级数据类型
export interface ClassInfo {
  id: string;
  name: string;
  code?: string;
  teacher?: { id: string; name: string };
  teacherId?: string;
  teacherName?: string;
  courseType?: string;
  capacity?: number;
  status?: string;
}

// 线索数据类型
export interface LeadInfo {
  id: string;
  customerName: string;
  age?: number;
  contact: string;
  source?: string;
  assigneeId?: string;
  assigneeName?: string;
  status?: string;
}

// 工作人员数据类型
export interface StaffUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
  phone?: string;
}

export const dataService = {
  /**
   * 获取教师列表（带缓存）
   * 缓存时间：5分钟
   */
  async getTeachers(forceRefresh = false): Promise<Teacher[]> {
    const fetcher = async () => {
      const response = await api.get('/users/teachers');
      return response.data || [];
    };

    if (forceRefresh) {
      return cacheService.refresh(CACHE_KEYS.TEACHERS, fetcher);
    }
    return cacheService.get(CACHE_KEYS.TEACHERS, fetcher, CACHE_TTL.MEDIUM);
  },

  /**
   * 获取班级列表（带缓存）
   * 缓存时间：5分钟
   */
  async getClasses(forceRefresh = false): Promise<ClassInfo[]> {
    const fetcher = async () => {
      const response = await api.get('/classes', { params: { pageSize: 1000 } });
      return response.data || [];
    };

    if (forceRefresh) {
      return cacheService.refresh(CACHE_KEYS.CLASSES, fetcher);
    }
    return cacheService.get(CACHE_KEYS.CLASSES, fetcher, CACHE_TTL.MEDIUM);
  },

  /**
   * 获取线索列表（带缓存）
   * 缓存时间：1分钟（线索可能频繁变化）
   */
  async getLeads(forceRefresh = false): Promise<LeadInfo[]> {
    const fetcher = async () => {
      const response = await api.get('/leads', { params: { pageSize: 100 } });
      return response.data || [];
    };

    if (forceRefresh) {
      return cacheService.refresh(CACHE_KEYS.LEADS, fetcher);
    }
    return cacheService.get(CACHE_KEYS.LEADS, fetcher, CACHE_TTL.SHORT);
  },

  /**
   * 获取工作人员列表（带缓存）
   * 缓存时间：5分钟
   */
  async getStaffList(forceRefresh = false): Promise<StaffUser[]> {
    const fetcher = async () => {
      const response = await api.get('/users/staff');
      return response.data || [];
    };

    if (forceRefresh) {
      return cacheService.refresh(CACHE_KEYS.STAFF_LIST, fetcher);
    }
    return cacheService.get(CACHE_KEYS.STAFF_LIST, fetcher, CACHE_TTL.MEDIUM);
  },

  /**
   * 获取销售人员列表（带缓存）
   * 缓存时间：5分钟
   */
  async getSalesStaff(forceRefresh = false): Promise<StaffUser[]> {
    const fetcher = async () => {
      const response = await api.get('/users/sales');
      return response.data || [];
    };

    if (forceRefresh) {
      return cacheService.refresh('salesStaff', fetcher);
    }
    return cacheService.get('salesStaff', fetcher, CACHE_TTL.MEDIUM);
  },

  /**
   * 刷新教师列表缓存
   */
  refreshTeachers(): Promise<Teacher[]> {
    return this.getTeachers(true);
  },

  /**
   * 刷新班级列表缓存
   */
  refreshClasses(): Promise<ClassInfo[]> {
    return this.getClasses(true);
  },

  /**
   * 刷新线索列表缓存
   */
  refreshLeads(): Promise<LeadInfo[]> {
    return this.getLeads(true);
  },

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    cacheService.clearAll();
  },

  /**
   * 当数据变更时清除相关缓存
   */
  onClassChanged(): void {
    cacheService.invalidate(CACHE_KEYS.CLASSES);
  },

  onTeacherChanged(): void {
    cacheService.invalidate(CACHE_KEYS.TEACHERS);
  },

  onLeadChanged(): void {
    cacheService.invalidate(CACHE_KEYS.LEADS);
  },
};
