import { persistentCacheService, ICacheService } from './persistentCache';

// 重新导出持久化缓存服务作为默认缓存服务
export const cacheService: ICacheService = persistentCacheService;

// 为了兼容性，保留 CacheService 类
export class CacheService implements ICacheService {
  get<T>(key: string): T | undefined {
    return cacheService.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    return cacheService.set(key, value, ttl);
  }

  del(key: string): number {
    return cacheService.del(key);
  }

  flush(): void {
    cacheService.flush();
  }

  keys(): string[] {
    return cacheService.keys();
  }

  persist(): void {
    cacheService.persist();
  }
}
