import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Config } from "./config.js";
import { Pool } from "./db.js";
import { createApp } from "./app.js";
import { applyTrackedMigrations, loadTrackedMigrationFiles } from "./migrate.js";
import { mockStkClient, type StkClient } from "./mpesa/client.js";
import { EVENT_STARTS_AT, EVENT_VENUE } from "./eventFacts.js";

const dbUrl =
  process.env["INTEGRATION_DATABASE_URL"]?.trim() ||
  process.env["MIGRATE_REPLAY_DATABASE_URL"]?.trim();

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: "test",
    PORT: 8787,
    CLIENT_ORIGIN: "http://127.0.0.1:5173",
    DATABASE_URL: dbUrl ?? "postgres://unused",
    SESSION_SECRET: "integration-session-secret",
    TICKET_SIGNING_SECRET: "integration-ticket-secret",
    COOKIE_SECURE: false,
    MPESA_MODE: "mock",
    PAYMENT_PROVIDER: "mock",
    PAYSTACK_SECRET_KEY: undefined,
    MPESA_ALLOW_MOCK: false,
    MPESA_ENV: "sandbox",
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    GOOGLE_REDIRECT_URI: undefined,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    STAFF_EMAIL: undefined,
    STAFF_PASSWORD: undefined,
    STAFF_PHONE: undefined,
    MPESA_CONSUMER_KEY: undefined,
    MPESA_CONSUMER_SECRET: undefined,
    MPESA_SHORTCODE: undefined,
    MPESA_PASSKEY: undefined,
    MPESA_CALLBACK_URL: undefined,
    ...overrides,
  };
}

function unpaidStkClient(): StkClient {
  return {
    async push(input) {
      return {
        checkoutRequestId: `live-${input.accountRef}`,
        merchantRequestId: `m-live-${input.accountRef}`,
      };
    },
    async query() {
      return { resultCode: "1032", resultDesc: "Request cancelled by user" };
    },
  };
}

async function seedMinimal(pool: Pool): Promise<{
  userId: string;
  staffId: string;
  eventId: string;
}> {
  const eventId = randomUUID();
  const userId = randomUUID();
  const staffId = randomUUID();
  await pool.query(
    `INSERT INTO events (id, name, presenter, venue, starts_at, attendee_target, flash_enabled)
     VALUES (?, 'Sherehe', 'Food With Walter Kenya', ?, ?, 200, FALSE)`,
    [eventId, EVENT_VENUE, EVENT_STARTS_AT],
  );
  await pool.query(
    `INSERT INTO ticket_types (id, event_id, code, name, price_ksh, seats_per_unit, capacity, sort_order)
     VALUES (?, ?, 'early_bird', 'Early Bird', 2000, 1, 125, 1)`,
    [randomUUID(), eventId],
  );
  const open = new Date(Date.now() - 86_400_000);
  const close = new Date(Date.now() + 86_400_000 * 30);
  await pool.query(
    `INSERT INTO sale_windows (id, event_id, ticket_code, starts_at, ends_at)
     VALUES (?, ?, 'early_bird', ?, ?)`,
    [randomUUID(), eventId, open, close],
  );
  await pool.query(
    `INSERT INTO users (id, email, phone, role, display_name)
     VALUES (?, 'buyer@example.com', '254712345678', 'customer', 'Buyer')`,
    [userId],
  );
  await pool.query(
    `INSERT INTO users (id, email, phone, role, display_name)
     VALUES (?, 'staff@example.com', '254700000001', 'staff', 'Staff')`,
    [staffId],
  );
  return { userId, staffId, eventId };
}

async function createSessionRow(
  pool: Pool,
  userId: string,
): Promise<string> {
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 86_400_000);
  await pool.query(
    "INSERT INTO sessions (id, account_kind, user_id, expires_at) VALUES (?, 'user', ?, ?)",
    [id, userId, expires],
  );
  return id;
}

function cookieHeader(
  sid: string,
  csrf: string,
  portal: "user" | "admin" = "user",
): string {
  return `sherehe_sid_${portal}=${sid}; sherehe_csrf=${csrf}`;
}

describe.skipIf(!dbUrl)("HTTP integration", () => {
  let pool: Pool;
  let server: Server;
  let baseUrl: string;
  let userId: string;
  let staffId: string;
  let userSid: string;
  let staffSid: string;
  let csrf: string;

  beforeAll(async () => {
    if (!dbUrl) throw new Error("missing db url");
    pool = new Pool(testConfig({ DATABASE_URL: dbUrl }));
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    const files = await loadTrackedMigrationFiles();
    await applyTrackedMigrations(pool, files);
    const seeded = await seedMinimal(pool);
    userId = seeded.userId;
    staffId = seeded.staffId;
    userSid = await createSessionRow(pool, userId);
    staffSid = await createSessionRow(pool, staffId);

    const app = createApp(pool, testConfig({ DATABASE_URL: dbUrl }), mockStkClient());
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const csrfRes = await fetch(`${baseUrl}/v1/auth/csrf`, {
      headers: { "X-Sherehe-Portal": "user" },
    });
    const csrfBody = (await csrfRes.json()) as { csrfToken: string };
    csrf = csrfBody.csrfToken;
    expect(csrf).toBeTruthy();
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (pool) await pool.end();
  });

  it("returns 410 for password register and login", async () => {
    for (const path of ["/v1/auth/register", "/v1/auth/login"]) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          "X-Sherehe-Portal": "user",
          Cookie: `sherehe_csrf=${csrf}`,
        },
        body: JSON.stringify({
          email: "x@example.com",
          phone: "254712345679",
          password: "password-long",
        }),
      });
      expect(res.status).toBe(410);
    }
  });

  it("reports healthy db on /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { db: boolean } };
    expect(body.status).toBe("ok");
    expect(body.checks.db).toBe(true);
  });

  it("checks out a mock ticket order to paid", async () => {
    const res = await fetch(`${baseUrl}/v1/orders/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        "X-Sherehe-Portal": "user",
        Cookie: cookieHeader(userSid, csrf, "user"),
      },
      body: JSON.stringify({ code: "early_bird", qty: 1 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      orderId: string;
      payment: { mode: string };
    };
    expect(body.payment.mode).toBe("mock");
    const get = await fetch(`${baseUrl}/v1/orders/${body.orderId}`, {
      headers: {
        "X-Sherehe-Portal": "user",
        Cookie: cookieHeader(userSid, csrf, "user"),
      },
    });
    expect(get.status).toBe(200);
    const order = (await get.json()) as { status: string };
    expect(order.status).toBe("paid");
  });

  it("rejects a forged live callback when STK query is unpaid", async () => {
    const livePool = new Pool(testConfig({ DATABASE_URL: dbUrl! }));
    const liveApp = createApp(
      livePool,
      testConfig({
        DATABASE_URL: dbUrl!,
        MPESA_MODE: "live",
        PAYMENT_PROVIDER: "daraja",
      }),
      unpaidStkClient(),
    );
    const liveServer = createServer(liveApp);
    await new Promise<void>((resolve) => {
      liveServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = liveServer.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const liveBase = `http://127.0.0.1:${addr.port}`;

    const checkoutId = `forged-${randomUUID().slice(0, 8)}`;
    const orderId = randomUUID();
    await livePool.query(
      `INSERT INTO orders (id, account_kind, user_id, event_id, kind, status, total_ksh, hold_expires_at)
       VALUES (?, 'user', ?, (SELECT id FROM events LIMIT 1), 'tickets', 'pending', 2000, NOW() + INTERVAL '10 minutes')`,
      [orderId, userId],
    );
    await livePool.query(
      `INSERT INTO order_items (id, order_id, sku_kind, sku_code, title, qty, unit_price_ksh, seats)
       VALUES (?, ?, 'ticket', 'early_bird', 'Early Bird', 1, 2000, 1)`,
      [randomUUID(), orderId],
    );
    await livePool.query(
      `INSERT INTO payments (id, order_id, provider, checkout_request_id, merchant_request_id, status)
       VALUES (?, ?, 'mpesa', ?, ?, 'pending')`,
      [randomUUID(), orderId, checkoutId, `m-${checkoutId}`],
    );

    const cb = await fetch(`${liveBase}/v1/payments/mpesa/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Body: {
          stkCallback: {
            MerchantRequestID: `m-${checkoutId}`,
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            ResultDesc: "Success",
            CallbackMetadata: {
              Item: [{ Name: "MpesaReceiptNumber", Value: "FAKE123" }],
            },
          },
        },
      }),
    });
    expect(cb.status).toBe(200);

    const [rows] = await livePool.query<Array<{ status: string }>>(
      "SELECT status FROM orders WHERE id = ?",
      [orderId],
    );
    expect(rows[0]?.status).toBe("pending");

    await new Promise<void>((resolve, reject) => {
      liveServer.close((err) => (err ? reject(err) : resolve()));
    });
    await livePool.end();
  });

  it("lets staff refund an unused paid order", async () => {
    const orderRes = await fetch(`${baseUrl}/v1/orders/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        "X-Sherehe-Portal": "user",
        Cookie: cookieHeader(userSid, csrf, "user"),
      },
      body: JSON.stringify({ code: "early_bird", qty: 1 }),
    });
    expect(orderRes.status).toBe(201);
    const { orderId } = (await orderRes.json()) as { orderId: string };

    const refund = await fetch(`${baseUrl}/v1/staff/orders/${orderId}/refund`, {
      method: "POST",
      headers: {
        "X-CSRF-Token": csrf,
        "X-Sherehe-Portal": "admin",
        Cookie: cookieHeader(staffSid, csrf, "admin"),
      },
    });
    expect(refund.status).toBe(200);
    const body = (await refund.json()) as { refunded: boolean };
    expect(body.refunded).toBe(true);
  });
});
