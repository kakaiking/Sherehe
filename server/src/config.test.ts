import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const base = {
  SESSION_SECRET: "sixteen-chars-min",
  TICKET_SIGNING_SECRET: "sixteen-chars-min",
  DATABASE_URL: "postgres://sherehe:local-dev-only@127.0.0.1:5433/sherehe",
};

const productionAdmins = {
  STAFF_EMAILS: "one.admin@example.com,two.admin@example.com",
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
      MPESA_ALLOW_MOCK: "true",
      ...productionAdmins,
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

  it("rejects production mock STK without MPESA_ALLOW_MOCK", () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        CLIENT_ORIGIN: "https://example.vercel.app",
        KV_REST_API_URL: "https://us1.upstash.io",
        KV_REST_API_TOKEN: "upstash-token-value",
        MPESA_MODE: "mock",
        ...productionAdmins,
      }),
    ).toThrow(/Invalid environment/);
  });

  it("allows production mock STK when MPESA_ALLOW_MOCK=true", () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: "production",
      CLIENT_ORIGIN: "https://example.vercel.app",
      KV_REST_API_URL: "https://us1.upstash.io",
      KV_REST_API_TOKEN: "upstash-token-value",
      MPESA_MODE: "mock",
      MPESA_ALLOW_MOCK: "true",
      ...productionAdmins,
    });
    expect(config.STAFF_EMAILS).toEqual([
      "one.admin@example.com",
      "two.admin@example.com",
    ]);
    expect(config.MPESA_MODE).toBe("mock");
    expect(config.MPESA_ALLOW_MOCK).toBe(true);
    expect(config.PAYMENT_PROVIDER).toBe("mock");
  });

  it("selects Paystack when PAYMENT_PROVIDER=paystack and a secret key is set", () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: "production",
      CLIENT_ORIGIN: "https://example.vercel.app",
      KV_REST_API_URL: "https://us1.upstash.io",
      KV_REST_API_TOKEN: "upstash-token-value",
      PAYMENT_PROVIDER: "paystack",
      PAYSTACK_SECRET_KEY: "sk_live_examplekey",
      ...productionAdmins,
    });
    expect(config.PAYMENT_PROVIDER).toBe("paystack");
  });

  it("requires exactly two distinct admin emails in production", () => {
    const prod = {
      ...base,
      NODE_ENV: "production" as const,
      CLIENT_ORIGIN: "https://example.vercel.app",
      KV_REST_API_URL: "https://us1.upstash.io",
      KV_REST_API_TOKEN: "upstash-token-value",
      MPESA_ALLOW_MOCK: "true",
    };
    expect(() => loadConfig(prod)).toThrow(/Invalid environment/);
    expect(() =>
      loadConfig({ ...prod, STAFF_EMAILS: "only.one@example.com" }),
    ).toThrow(/Invalid environment/);
    expect(() =>
      loadConfig({
        ...prod,
        STAFF_EMAILS: "same@example.com,same@example.com",
      }),
    ).toThrow(/Invalid environment/);
    expect(() =>
      loadConfig({
        ...prod,
        STAFF_EMAILS: "a@example.com,b@example.com,c@example.com",
      }),
    ).toThrow(/Invalid environment/);
  });

  it("rejects Paystack without a secret key", () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "development",
        CLIENT_ORIGIN: "http://localhost:5173",
        PAYMENT_PROVIDER: "paystack",
      }),
    ).toThrow(/Invalid environment/);
  });
});
