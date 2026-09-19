import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
import { liveStkClient, mockStkClient } from "./mpesa/client.js";
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
  const stk =
    config.MPESA_MODE === "live"
      ? liveStkClient({
          consumerKey: config.MPESA_CONSUMER_KEY ?? "",
          consumerSecret: config.MPESA_CONSUMER_SECRET ?? "",
          shortcode: config.MPESA_SHORTCODE ?? "",
          passkey: config.MPESA_PASSKEY ?? "",
          callbackUrl: config.MPESA_CALLBACK_URL ?? "",
          env: config.MPESA_ENV,
        })
      : mockStkClient();
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
