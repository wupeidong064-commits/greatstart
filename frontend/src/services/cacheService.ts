/**
 * 缓存服务 - 减少 API 调用次数
 *
 * 用于缓存不频繁变化的数据（如教师列表、班级列表等）
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

class CacheService {
  private cache: Map<string, CacheItem<any>> = new Map();

  // 默认缓存时间：5分钟
  private defaultTTL = 5 * 60 * 1000;

  /**
   * 获取缓存数据，如果过期或不存在则调用 fetcher
   */
  async get<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const now = Date.now();
    const cacheTTL = ttl ?? this.defaultTTL;
    const cached = this.cache.get(key);

    // 如果缓存存在且未过期，直接返回
    if (cached && now - cached.timestamp < cacheTTL) {
      console.log(`[Cache] Hit: ${key}`);
      return cached.data;
    }

    // 缓存过期或不存在，重新获取
    console.log(`[Cache] Miss: ${key}, fetching...`);
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: now });
    return data;
  }

  /**
   * 强制刷新缓存
   */
  async refresh<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    console.log(`[Cache] Refresh: ${key}`);
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * 清除指定缓存
   */
  invalidate(key: string): void {
    console.log(`[Cache] Invalidate: ${key}`);
    this.cache.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    console.log('[Cache] Clear all');
    this.cache.clear();
  }

  /**
   * 清除匹配模式的缓存
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

// 缓存键常量
export const CACHE_KEYS = {
  TEACHERS: 'teachers',
  CLASSES: 'classes',
  LEADS: 'leads',
  STAFF_LIST: 'staffList',
  ORGANIZATIONS: 'organizations',
  CAMPUSES: 'campuses',
  STUDENTS: 'students',
};

// 缓存时间常量（毫秒）
export const CACHE_TTL = {
  SHORT: 1 * 60 * 1000,      // 1分钟 - 用于频繁变化的数据
  MEDIUM: 5 * 60 * 1000,     // 5分钟 - 默认
  LONG: 30 * 60 * 1000,      // 30分钟 - 用于很少变化的数据
  HOUR: 60 * 60 * 1000,      // 1小时
};

// 导出单例
export const cacheService = new CacheService();
