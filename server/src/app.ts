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

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/v1/payments", mpesaCallbackRouter(pool, config));

  app.use(requireCsrf);

  const authLimiter = pathLimiter(redis, "auth", 30);
  const payLimiter = pathLimiter(redis, "pay", 20);

  app.use("/v1/auth/login", authLimiter);
  app.use("/v1/auth/register", authLimiter);
  app.use("/v1/auth/google", authLimiter);
  app.use("/v1/auth", authRouter(pool, config));
  app.use("/v1/catalog", catalogRouter(pool));
  app.use("/v1/orders", payLimiter, ordersRouter(pool, config, stk));
  app.use("/v1/staff", staffRouter(pool, config));
  app.use("/v1/passes", passesRouter(pool, config));
  app.use("/v1/account", accountRouter(pool));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log("error", "unhandled", {
      name: err instanceof Error ? err.name : "unknown",
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
