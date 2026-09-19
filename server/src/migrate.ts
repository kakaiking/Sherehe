import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { loadConfig } from "./config.js";
import { createPool, type Pool } from "./db.js";
import { hashPassword } from "./auth/password.js";
import {
  EVENT_STARTS_AT,
  EVENT_VENUE,
  VENDOR_PAY_BY,
  VENDOR_SETUP,
} from "./eventFacts.js";
import { log } from "./log.js";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
if (!process.env["VERCEL"]) {
  dotenv.config({ path: path.join(root, ".env") });
}

async function initSqlPath(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "db/migrations/001_init.sql"),
    path.join(root, "db/migrations/001_init.sql"),
  ];
  for (const p of candidates) {
    try {
      await readFile(p, "utf8");
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error("missing_migration_sql");
}

export async function migrateAndSeed(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  try {
    const initSql = await readFile(await initSqlPath(), "utf8");
    await pool.query(initSql);
    const [appliedInit] = await pool.query("SELECT id FROM schema_migrations WHERE id = '001_init'");
    const applied = appliedInit as Array<{ id: string }>;
    if (applied.length === 0) {
      await pool.query("INSERT INTO schema_migrations (id) VALUES (?)", ["001_init"]);
    }
    const [events] = await pool.query("SELECT id FROM events LIMIT 1");
    if ((events as Array<{ id: string }>).length === 0) {
      await seed(pool, config);
    }
    await ensureFoodPlates(pool);
    await pool.query("UPDATE events SET venue = ?, starts_at = ?", [
      EVENT_VENUE,
      EVENT_STARTS_AT,
    ]);
    await pool.query(
      "UPDATE vendor_packages SET payment_deadline = ?, setup_time = ? WHERE code = 'stall_std'",
      [VENDOR_PAY_BY, VENDOR_SETUP.stall_std],
    );
    await pool.query(
      "UPDATE vendor_packages SET payment_deadline = ?, setup_time = ? WHERE code = 'stall_prem'",
      [VENDOR_PAY_BY, VENDOR_SETUP.stall_prem],
    );
    await pool.query(
      "UPDATE ticket_types SET name = 'Group Ticket (5 people)' WHERE code = 'group'",
    );
    log("info", "migrate_ok", {});
  } finally {
    await pool.end();
  }
}

const FOOD_PLATES: Array<[string, string, string, number, number]> = [
  ["nyama-choma", "Nyama choma", "Charcoal goat, kachumbari on the side.", 1200, 80],
  ["mbuzi-ribs", "Mbuzi ribs", "Slow ribs, chilli salt.", 1500, 40],
  ["chicken-skewers", "Chicken skewers", "Three skewers, peanut dip.", 900, 60],
  ["samosa-plate", "Samosa plate", "Six beef samosas.", 600, 90],
  ["ugali-sukuma", "Ugali and sukuma", "The house plate.", 500, 100],
  ["pilau-bowl", "Pilau bowl", "Spiced rice, raisins, kachumbari.", 800, 70],
  ["mutura", "Mutura", "Street mutura, hot off the coal.", 400, 50],
  ["mahamri", "Mahamri", "Four mahamri, cardamom sugar.", 350, 80],
  ["chapati-beans", "Chapati and beans", "Two chapati, bean stew.", 550, 70],
  ["fish-fingers", "Lake fish fingers", "Crumbed tilapia, tartare.", 1100, 35],
  ["githeri-cup", "Githeri cup", "Maize and beans, ghee.", 450, 60],
  ["sukuma-extra", "Extra sukuma", "A side of greens.", 200, 120],
];

async function ensureFoodPlates(pool: Pool): Promise<void> {
  for (const p of FOOD_PLATES) {
    const [rows] = await pool.query("SELECT id FROM products WHERE slug = ?", [p[0]]);
    if ((rows as Array<{ id: string }>).length > 0) continue;
    await pool.query(
      "INSERT INTO products (id, slug, name, description, price_ksh, stock) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), ...p],
    );
  }
}

async function seed(
  pool: Pool,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const eventId = randomUUID();
  await pool.query(
    `INSERT INTO events (id, name, presenter, venue, starts_at, attendee_target, flash_enabled)
     VALUES (?, 'Sherehe', 'Food With Walter Kenya', ?, ?, 200, FALSE)`,
    [eventId, EVENT_VENUE, EVENT_STARTS_AT],
  );
  const types: Array<[string, string, number, number, number | null, number]> = [
    ["early_bird", "Early Bird", 2000, 1, 40, 1],
    ["rush", "Rush Ticket", 2800, 1, 40, 2],
    ["regular", "Regular Ticket", 3500, 1, 80, 3],
    ["vip", "VIP Ticket", 4500, 1, 20, 4],
    ["viip", "VIIP Ticket", 5500, 1, 10, 5],
    ["group", "Group Ticket (5 people)", 13000, 5, 10, 6],
    ["flash", "Flash Sale", 1500, 1, 50, 7],
  ];
  for (const t of types) {
    await pool.query(
      `INSERT INTO ticket_types (id, event_id, code, name, price_ksh, seats_per_unit, capacity, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), eventId, ...t],
    );
  }
  const now = new Date();
  const open = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const earlyEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO sale_windows (id, event_id, ticket_code, starts_at, ends_at) VALUES
     (?, ?, 'early_bird', ?, ?),
     (?, ?, 'regular', ?, NULL),
     (?, ?, 'vip', ?, NULL),
     (?, ?, 'viip', ?, NULL),
     (?, ?, 'group', ?, NULL)`,
    [
      randomUUID(), eventId, open, earlyEnd,
      randomUUID(), eventId, open,
      randomUUID(), eventId, open,
      randomUUID(), eventId, open,
      randomUUID(), eventId, open,
    ],
  );
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(now);
    const day = d.getDay();
    const toSat = (6 - day + 7) % 7;
    d.setDate(d.getDate() + toSat + i * 7);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setDate(end.getDate() + 2);
    await pool.query(
      "INSERT INTO sale_windows (id, event_id, ticket_code, starts_at, ends_at) VALUES (?, ?, 'rush', ?, ?)",
      [randomUUID(), eventId, d, end],
    );
  }
  const deadline = VENDOR_PAY_BY;
  await pool.query(
    `INSERT INTO vendor_packages
     (id, event_id, code, name, category_hint, space_description, fee_ksh, setup_time, operating_hours, payment_deadline, rules)
     VALUES
     (?, ?, 'stall_std', 'Standard stall', 'Food', '3×3 m stall, one table, power point', 15000, ?, '10:00–22:00', ?, ?),
     (?, ?, 'stall_prem', 'Premium stall', 'Food or beverage', '6×3 m, two tables, power, shared lighting', 28000, ?, '10:00–22:00', ?, ?)`,
    [
      randomUUID(),
      eventId,
      VENDOR_SETUP.stall_std,
      deadline,
      "Bring your own branding. No open flame without written approval. Pack out all waste. Payment is due before the deadline on this package.",
      randomUUID(),
      eventId,
      VENDOR_SETUP.stall_prem,
      deadline,
      "Premium stall includes a shared generator circuit. Staff must follow the same waste and fire rules as standard stalls.",
    ],
  );
  const services: Array<[string, string, string, string, number]> = [
    ["catering-50", "Catering for 50", "catering", "Buffet menu, service staff, and crockery for fifty guests.", 85000],
    ["decor-salon", "Décor salon", "decor", "Tablescapes, florals, and lighting for a seated salon.", 45000],
    ["sound-stage", "Sound stage", "sound", "PA, two wireless mics, and a technician for the evening.", 35000],
    ["venue-half", "Venue half-day", "venue", "Half-day venue arrangement through Food With Walter.", 60000],
  ];
  for (const s of services) {
    await pool.query(
      "INSERT INTO service_offerings (id, slug, name, category, description, price_ksh) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), ...s],
    );
  }
  const products: Array<[string, string, string, number, number]> = FOOD_PLATES;
  for (const p of products) {
    await pool.query(
      "INSERT INTO products (id, slug, name, description, price_ksh, stock) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), ...p],
    );
  }
  if (config.STAFF_EMAIL && config.STAFF_PASSWORD && config.STAFF_PHONE) {
    const hash = await hashPassword(config.STAFF_PASSWORD);
    await pool.query(
      "INSERT INTO users (id, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'staff')",
      [randomUUID(), config.STAFF_EMAIL.toLowerCase(), config.STAFF_PHONE, hash],
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateAndSeed().catch((err: unknown) => {
    log("error", "migrate_failed", {
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    process.exit(1);
  });
}
