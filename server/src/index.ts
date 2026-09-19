import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

if (!process.env["VERCEL"]) {
  dotenv.config({
    path: path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../.env"),
  });
}

import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
import { liveStkClient, mockStkClient } from "./mpesa/client.js";
import { log } from "./log.js";
import { migrateAndSeed } from "./migrate.js";
import { createRedis, withMigrateLock } from "./redis.js";

const config = loadConfig();
const pool = createPool(config);
const redis = createRedis(config);
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

const app = createApp(pool, config, stk, redis);
const server = app.listen(config.PORT, () => {
  log("info", "listen", { port: config.PORT });
});

async function shutdown(signal: string): Promise<void> {
  log("info", "shutdown", { signal });
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("unhandledRejection", () => {
  log("error", "unhandled_rejection", {});
  process.exit(1);
});
process.on("uncaughtException", () => {
  log("error", "uncaught_exception", {});
  process.exit(1);
});

if (config.NODE_ENV !== "test") {
  withMigrateLock(redis, () => migrateAndSeed()).catch(() => {
    log("error", "startup_migrate_failed", {});
  });
}
