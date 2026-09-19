import { Ratelimit } from "@upstash/ratelimit";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { RedisClient } from "./redis.js";

function tooMany(): { type: string; title: string; status: number; detail: string } {
  return {
    type: "https://httpstatuses.com/429",
    title: "Too Many Requests",
    status: 429,
    detail: "Slow down and try again shortly.",
  };
}

export function pathLimiter(
  redis: RedisClient | undefined,
  prefix: string,
  max: number,
): RequestHandler {
  if (!redis) {
    return rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: max,
      standardHeaders: true,
      legacyHeaders: false,
    });
  }
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, "15 m"),
    prefix: `sherehe:${prefix}`,
  });
  return (req, res, next) => {
    const ip = req.ip || "unknown";
    void limiter
      .limit(ip)
      .then(({ success }) => {
        if (!success) {
          res.status(429).json(tooMany());
          return;
        }
        next();
      })
      .catch(next);
  };
}
