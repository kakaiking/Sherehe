import { Redis } from "@upstash/redis";
import type { Config } from "./config.js";

export type RedisClient = Redis;

export function createRedis(config: Config): RedisClient | undefined {
  const url = config.UPSTASH_REDIS_REST_URL;
  const token = config.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  return new Redis({ url, token });
}

/** Cross-instance lock so migrate/seed does not race on cold starts. */
export async function withMigrateLock(
  redis: RedisClient | undefined,
  work: () => Promise<void>,
): Promise<void> {
  if (!redis) {
    await work();
    return;
  }
  const key = "sherehe:migrate-lock";
  for (let i = 0; i < 20; i += 1) {
    const got = await redis.set(key, "1", { nx: true, ex: 120 });
    if (got) {
      try {
        await work();
      } finally {
        await redis.del(key);
      }
      return;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  await work();
}
