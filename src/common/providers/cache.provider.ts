import { REDIS_CLIENT } from '@/redis/redis.module';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheProvider {
	constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

	async get<T>(key: string): Promise<T | null> {
		const data = await this.redisClient.get(key);
		return data ? JSON.parse(data) : null;
	}

	async set(key: string, value: unknown, ttl?: number): Promise<void> {
		const data = JSON.stringify(value);
		await this.redisClient.set(key, data, 'EX', ttl);
	}

	async del(...keys: string[]): Promise<void> {
		if (keys.length > 0) await this.redisClient.del(...keys);
	}

	async delByPattern(pattern: string): Promise<void> {
		const keys = await this.redisClient.keys(pattern);
		if (keys.length > 0) await this.redisClient.del(...keys);
	}

	async getOrSet<T>(
		key: string,
		ttl: number,
		fetchFn: () => Promise<T>,
	): Promise<T> {
		const cached = await this.get<T>(key);
		if (cached !== null) {
			return cached;
		}
		const data = await fetchFn();
		await this.set(key, data, ttl);
		return data;
	}
}
