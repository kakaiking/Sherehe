import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const base = {
  SESSION_SECRET: "sixteen-chars-min",
  TICKET_SIGNING_SECRET: "sixteen-chars-min",
  DATABASE_URL: "postgres://sherehe:local-dev-only@127.0.0.1:5433/sherehe",
};

describe("loadConfig", () => {
  it("derives CLIENT_ORIGIN from VERCEL_URL when unset", () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: "development",
      VERCEL: "1",
      VERCEL_URL: "sherehe-abc.vercel.app",
    });
    expect(config.CLIENT_ORIGIN).toBe("https://sherehe-abc.vercel.app");
    expect(config.COOKIE_SECURE).toBe(true);
  });

  it("reads Upstash from Vercel KV_* aliases", () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: "production",
      CLIENT_ORIGIN: "https://example.vercel.app",
      KV_REST_API_URL: "https://us1.upstash.io",
      KV_REST_API_TOKEN: "upstash-token-value",
    });
    expect(config.UPSTASH_REDIS_REST_URL).toBe("https://us1.upstash.io");
    expect(config.UPSTASH_REDIS_REST_TOKEN).toBe("upstash-token-value");
  });

  it("requires Upstash in production", () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        CLIENT_ORIGIN: "https://example.vercel.app",
      }),
    ).toThrow(/Invalid environment/);
  });
});
