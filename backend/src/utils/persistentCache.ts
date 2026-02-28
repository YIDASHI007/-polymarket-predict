import fs from 'fs';
import path from 'path';
import NodeCache from 'node-cache';

interface CacheEntry<T> {
  value: T;
  expiry: number | null;
}

interface CacheData {
  [key: string]: CacheEntry<any>;
}

// 缓存服务接口（只暴露公共方法）
export interface ICacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl?: number): boolean;
  del(key: string): number;
  flush(): void;
  keys(): string[];
  persist(): void;
}

// 持久化缓存配置
const CACHE_FILE = path.join(process.cwd(), 'data', 'cache.json');
const SAVE_INTERVAL = 60000; // 每60秒保存一次
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 文件保留7天（实现"永久"缓存）
const MEMORY_TTL_OVERRIDE = 600; // 内存中强制使用10分钟TTL

class PersistentCacheServiceImpl implements ICacheService {
  private cache: NodeCache;
  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor() {
    this.cache = new NodeCache({ 
      stdTTL: 0,
      checkperiod: 0,
    });

    this.ensureDataDir();
    this.loadFromFile();
    this.startAutoSave();
    this.setupGracefulShutdown();
  }

  private ensureDataDir(): void {
    const dataDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadFromFile(): void {
    try {
      if (!fs.existsSync(CACHE_FILE)) {
        console.log('[PersistentCache] No cache file found, starting fresh');
        return;
      }

      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cacheData: CacheData = JSON.parse(data);
      const now = Date.now();
      let restoredCount = 0;
      let expiredCount = 0;
      let staleCount = 0;

      Object.entries(cacheData).forEach(([key, entry]) => {
        // 检查文件级别的最大年龄（7天）
        const fileAge = now - (entry.expiry ? entry.expiry - 7 * 24 * 60 * 60 * 1000 : now);
        if (fileAge > MAX_CACHE_AGE) {
          expiredCount++;
          return;
        }

        // 即使内存TTL过期了，也恢复数据（但使用较短的TTL触发后台刷新）
        const isMemoryExpired = entry.expiry && entry.expiry < now;
        
        if (isMemoryExpired) {
          // 数据在内存层面已过期，但仍恢复它以实现"秒开"
          // 设置一个短暂的TTL（30秒），让服务启动后尽快刷新
          this.cache.set(key, entry.value, 30);
          staleCount++;
        } else if (entry.expiry) {
          const ttl = Math.max(1, Math.floor((entry.expiry - now) / 1000));
          this.cache.set(key, entry.value, ttl);
        } else {
          this.cache.set(key, entry.value);
        }
        restoredCount++;
      });

      console.log(`[PersistentCache] Restored ${restoredCount} entries (${staleCount} stale), skipped ${expiredCount} expired`);
    } catch (error) {
      console.error('[PersistentCache] Failed to load cache file:', error);
    }
  }

  private saveToFile(): void {
    if (!this.isDirty) return;

    try {
      const keys = this.cache.keys();
      const cacheData: CacheData = {};

      keys.forEach(key => {
        const value = this.cache.get(key);
        const ttl = this.cache.getTtl(key);
        
        if (value !== undefined) {
          cacheData[key] = {
            value,
            expiry: ttl || null,
          };
        }
      });

      const tempFile = `${CACHE_FILE}.tmp`;
      const jsonData = JSON.stringify(cacheData, null, 2);
      
      try {
        // 先尝试直接写入（不使用临时文件）
        fs.writeFileSync(CACHE_FILE, jsonData, 'utf-8');
      } catch (writeError: any) {
        // 如果直接写入失败，尝试使用临时文件方式
        try {
          fs.writeFileSync(tempFile, jsonData, 'utf-8');
          // Windows 下 rename 可能有问题，尝试复制+删除
          try {
            fs.renameSync(tempFile, CACHE_FILE);
          } catch (renameError) {
            fs.copyFileSync(tempFile, CACHE_FILE);
            fs.unlinkSync(tempFile);
          }
        } catch (fallbackError) {
          console.error('[PersistentCache] Failed to save cache file:', fallbackError);
          return;
        }
      }

      this.isDirty = false;
      console.log(`[PersistentCache] Saved ${keys.length} entries to file`);
    } catch (error) {
      console.error('[PersistentCache] Failed to save cache file:', error);
    }
  }

  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      this.saveToFile();
    }, SAVE_INTERVAL);
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      console.log('[PersistentCache] Saving before exit...');
      this.saveToFile();
      if (this.saveTimer) {
        clearInterval(this.saveTimer);
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
  }

  // 公共 API 实现
  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    this.isDirty = true;
    if (ttl) {
      return this.cache.set(key, value, ttl);
    }
    return this.cache.set(key, value);
  }

  del(key: string): number {
    this.isDirty = true;
    return this.cache.del(key);
  }

  flush(): void {
    this.isDirty = true;
    this.cache.flushAll();
  }

  keys(): string[] {
    return this.cache.keys();
  }

  persist(): void {
    this.saveToFile();
  }
}

// 导出单例实例，类型为接口（隐藏实现细节）
export const persistentCacheService: ICacheService = new PersistentCacheServiceImpl();
