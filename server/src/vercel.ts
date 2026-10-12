import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
import { stkClientFor } from "./mpesa/factory.js";
import { migrateAndSeed } from "./migrate.js";
import { createRedis, withMigrateLock } from "./redis.js";
import { log } from "./log.js";
import { resolveSingletonBoot, type BootSlot } from "./bootOnce.js";

const boot: BootSlot<Express> = {};

async function startApp(): Promise<Express> {
  const config = loadConfig();
  const pool = createPool(config);
  const redis = createRedis(config);
  await withMigrateLock(redis, () => migrateAndSeed());
  const stk = stkClientFor(config, pool);
  log("info", "vercel_boot", {});
  return createApp(pool, config, stk, redis);
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await resolveSingletonBoot(boot, startApp);
  app(req, res);
}
