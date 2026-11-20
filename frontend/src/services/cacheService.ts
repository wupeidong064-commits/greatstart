/**
 * 缓存服务 - 减少 API 调用次数
 *
 * 用于缓存不频繁变化的数据（如教师列表、班级列表等）
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

/** A superseded response must not reach either the cache or its original caller. */
export class CacheRequestCancelledError extends Error {
  readonly code = 'CACHE_REQUEST_CANCELLED';

  constructor() {
    super('数据请求已失效');
    this.name = 'CacheRequestCancelledError';
  }
}

export const isCacheRequestCancelled = (error: unknown): boolean =>
  typeof error === 'object' && error !== null &&
  'code' in error && error.code === 'CACHE_REQUEST_CANCELLED';

interface PendingRequest {
  id: symbol;
  promise: Promise<unknown>;
}

class CacheService {
  private cache: Map<string, CacheItem<unknown>> = new Map();
  private pending: Map<string, PendingRequest> = new Map();

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
      // Let synchronous logout/invalidation cancel a cache hit before it is delivered.
      await Promise.resolve();
      if (this.cache.get(key) !== cached) throw new CacheRequestCancelledError();
      return cached.data as T;
    }

    const pending = this.pending.get(key);
    if (pending) return pending.promise as Promise<T>;

    // 缓存过期或不存在，重新获取
    console.log(`[Cache] Miss: ${key}, fetching...`);
    return this.fetchAndCache(key, fetcher);
  }

  /**
   * 强制刷新缓存
   */
  async refresh<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    console.log(`[Cache] Refresh: ${key}`);
    this.cache.delete(key);
    return this.fetchAndCache(key, fetcher);
  }

  private fetchAndCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const id = Symbol(key);
    const isCurrent = () => this.pending.get(key)?.id === id;
    const promise = Promise.resolve().then(async () => {
      try {
        if (!isCurrent()) throw new CacheRequestCancelledError();
        const data = await fetcher();
        if (!isCurrent()) throw new CacheRequestCancelledError();
        // TTL starts when the response arrives, rather than before a slow request.
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        if (!isCurrent()) throw new CacheRequestCancelledError();
        throw error;
      } finally {
        if (isCurrent()) this.pending.delete(key);
      }
    });
    this.pending.set(key, { id, promise });
    return promise;
  }

  /**
   * 清除指定缓存
   */
  invalidate(key: string): void {
    console.log(`[Cache] Invalidate: ${key}`);
    this.cache.delete(key);
    this.pending.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    console.log('[Cache] Clear all');
    this.cache.clear();
    this.pending.clear();
  }

  /**
   * 清除匹配模式的缓存
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of new Set([...this.cache.keys(), ...this.pending.keys()])) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.pending.delete(key);
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
