import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import type { Pool } from "./db.js";
import type { Config } from "./config.js";
import type { StkClient } from "./mpesa/client.js";
import { csrfMiddleware, loadUser, requireCsrf } from "./auth/session.js";
import { pathLimiter } from "./limit.js";
import type { RedisClient } from "./redis.js";
import { authRouter } from "./auth/router.js";
import { catalogRouter } from "./routes/catalog.js";
import { ordersRouter, mpesaCallbackRouter } from "./routes/orders.js";
import { staffRouter } from "./routes/staff.js";
import { passesRouter } from "./routes/passes.js";
import { accountRouter } from "./routes/account.js";
import { log } from "./log.js";

export function createApp(
  pool: Pool,
  config: Config,
  stk: StkClient,
  redis?: RedisClient,
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", config.CLIENT_ORIGIN],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: "deny" },
    }),
  );
  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(csrfMiddleware(config));
  app.use(loadUser(pool));

  app.get("/health", async (_req, res) => {
    const checks: { db: boolean; redis: boolean | "skipped" } = {
      db: false,
      redis: redis ? false : "skipped",
    };
    try {
      await pool.query("SELECT 1");
      checks.db = true;
    } catch {
      checks.db = false;
    }
    if (redis) {
      try {
        const pong = await redis.ping();
        checks.redis = pong === "PONG" || pong === "pong" || Boolean(pong);
      } catch {
        checks.redis = false;
      }
    }
    const ok =
      checks.db && (checks.redis === "skipped" || checks.redis === true);
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      checks,
    });
  });

  const callbackLimiter = pathLimiter(redis, "mpesa-cb", 60);
  app.use("/v1/payments", callbackLimiter, mpesaCallbackRouter(pool, config, stk));

  app.use(requireCsrf);

  const authLimiter = pathLimiter(redis, "auth", 30);
  const payLimiter = pathLimiter(redis, "pay", 20);
  const staffLimiter = pathLimiter(redis, "staff", 60);
  const passLimiter = pathLimiter(redis, "passes", 120);

  app.use("/v1/auth/google", authLimiter);
  app.use("/v1/auth", authRouter(pool, config));
  app.use("/v1/catalog", catalogRouter(pool));
  app.use("/v1/orders", payLimiter, ordersRouter(pool, config, stk));
  app.use("/v1/staff", staffLimiter, staffRouter(pool, config));
  app.use("/v1/passes", passLimiter, passesRouter(pool, config));
  app.use("/v1/account", accountRouter(pool));

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    log("error", "unhandled", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      route: `${req.method} ${req.path}`.slice(0, 120),
    });
    if (res.headersSent) return;
    res.status(500).json({
      type: "https://httpstatuses.com/500",
      title: "Internal Server Error",
      status: 500,
      detail: "Something went wrong. Try again.",
    });
  });

  return app;
}
