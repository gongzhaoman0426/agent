import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  getClient(): Redis {
    return this.redis;
  }

  async get<T = string>(key: string): Promise<T | null> {
    const val = await this.redis.get(key);
    if (val === null) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      await this.redis.set(key, serialized, 'EX', ttl);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    this.logger.debug(`[Cache DEL] ${keys.join(', ')}`);
    return this.redis.del(...keys);
  }

  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await this.redis.del(...keys);
      }
    } while (cursor !== '0');
    if (deleted > 0) this.logger.debug(`[Cache DEL] ${pattern} → ${deleted} key(s)`);
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.logger.debug(`[Cache HIT] ${key}`);
      return cached;
    }
    this.logger.debug(`[Cache MISS] ${key}`);
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch (e) {
      this.logger.error('Redis health check failed', e);
      return false;
    }
  }
}
