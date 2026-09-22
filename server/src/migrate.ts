import { readdir, readFile } from "node:fs/promises";
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

async function migrationsDir(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "db/migrations"),
    path.join(root, "db/migrations"),
  ];
  for (const dir of candidates) {
    try {
      await readFile(path.join(dir, "001_init.sql"), "utf8");
      return dir;
    } catch {
      /* try next */
    }
  }
  throw new Error("missing_migration_sql");
}

export type MigrationQuery = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown]>;
};

export type TrackedMigration = {
  id: string;
  sql: string;
};

/**
 * Apply numbered SQL files once. Re-running 001 after tables already exist
 * is not safe: CREATE TABLE IF NOT EXISTS is a no-op, but CREATE INDEX on
 * columns added in a later file (account_kind) crashes boot.
 */
export async function applyTrackedMigrations(
  pool: MigrationQuery,
  files: TrackedMigration[],
): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
  const ran: string[] = [];
  for (const file of files) {
    const [appliedRows] = await pool.query(
      "SELECT id FROM schema_migrations WHERE id = ?",
      [file.id],
    );
    if ((appliedRows as Array<{ id: string }>).length > 0) continue;
    await pool.query(file.sql);
    await pool.query("INSERT INTO schema_migrations (id) VALUES (?)", [file.id]);
    ran.push(file.id);
  }
  return ran;
}

export async function loadTrackedMigrationFiles(): Promise<TrackedMigration[]> {
  const dir = await migrationsDir();
  const names = (await readdir(dir))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  if (!names.includes("001_init.sql")) {
    throw new Error("missing_migration_sql");
  }
  const files: TrackedMigration[] = [];
  for (const name of names) {
    files.push({
      id: name.replace(/\.sql$/, ""),
      sql: await readFile(path.join(dir, name), "utf8"),
    });
  }
  return files;
}

export async function migrateAndSeed(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  try {
    const files = await loadTrackedMigrationFiles();
    await applyTrackedMigrations(pool, files);
    const [events] = await pool.query("SELECT id FROM events LIMIT 1");
    if ((events as Array<{ id: string }>).length === 0) {
      await seed(pool, config);
    }
    await ensureFoodMeals(pool);
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
    await syncStaffEmail(pool, config);
    log("info", "migrate_ok", {});
  } finally {
    await pool.end();
  }
}

/** Keep exactly STAFF_EMAIL as staff; demote any other staff rows. */
async function syncStaffEmail(pool: Pool, config: ReturnType<typeof loadConfig>): Promise<void> {
  if (!config.STAFF_EMAIL) return;
  const email = config.STAFF_EMAIL.toLowerCase();
  await pool.query(
    "UPDATE users SET role = 'customer' WHERE role = 'staff' AND email <> ?",
    [email],
  );
  const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
  if ((rows as Array<{ id: string }>).length > 0) {
    await pool.query("UPDATE users SET role = 'staff' WHERE email = ?", [email]);
    return;
  }
  if (config.STAFF_PHONE) {
    const [byPhone] = await pool.query("SELECT id FROM users WHERE phone = ?", [
      config.STAFF_PHONE,
    ]);
    const phoneRow = (byPhone as Array<{ id: string }>)[0];
    if (phoneRow) {
      await pool.query("UPDATE users SET email = ?, role = 'staff' WHERE id = ?", [
        email,
        phoneRow.id,
      ]);
      return;
    }
  }
  if (config.STAFF_PASSWORD && config.STAFF_PHONE) {
    const hash = await hashPassword(config.STAFF_PASSWORD);
    await pool.query(
      "INSERT INTO users (id, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'staff')",
      [randomUUID(), email, config.STAFF_PHONE, hash],
    );
  }
}

const FOOD_MEALS: Array<[string, string, string, number, number]> = [
  ["nyama-choma", "Nyama choma", "Charcoal goat, kachumbari on the side.", 1200, 80],
  ["mbuzi-ribs", "Mbuzi ribs", "Slow ribs, chilli salt.", 1500, 40],
  ["chicken-skewers", "Chicken skewers", "Three skewers, peanut dip.", 900, 60],
  ["samosa-plate", "Samosas", "Six beef samosas.", 600, 90],
  ["ugali-sukuma", "Ugali and sukuma", "The house meal.", 500, 100],
  ["pilau-bowl", "Pilau bowl", "Spiced rice, raisins, kachumbari.", 800, 70],
  ["mutura", "Mutura", "Street mutura, hot off the coal.", 400, 50],
  ["mahamri", "Mahamri", "Four mahamri, cardamom sugar.", 350, 80],
  ["chapati-beans", "Chapati and beans", "Two chapati, bean stew.", 550, 70],
  ["fish-fingers", "Lake fish fingers", "Crumbed tilapia, tartare.", 1100, 35],
  ["githeri-cup", "Githeri cup", "Maize and beans, ghee.", 450, 60],
  ["sukuma-extra", "Extra sukuma", "A side of greens.", 200, 120],
];

const DEMO_STALLS: Array<{ email: string; displayName: string }> = [
  { email: "pit-side@sherehe.local", displayName: "Pit Side" },
  { email: "coal-corner@sherehe.local", displayName: "Coal Corner" },
];

/** Backfill missing seed meals onto the first stall vendor when one exists. */
async function ensureFoodMeals(pool: Pool): Promise<void> {
  const [vendorRows] = await pool.query(
    "SELECT id FROM vendors ORDER BY created_at ASC, id ASC LIMIT 1",
  );
  const ownerId = (vendorRows as Array<{ id: string }>)[0]?.id;
  if (!ownerId) return;
  for (const p of FOOD_MEALS) {
    const [rows] = await pool.query("SELECT id FROM products WHERE slug = ?", [p[0]]);
    if ((rows as Array<{ id: string }>).length > 0) continue;
    await pool.query(
      `INSERT INTO products (id, slug, name, description, price_ksh, stock, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), ...p, ownerId],
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
  const stallIds: string[] = [];
  for (const stall of DEMO_STALLS) {
    const id = randomUUID();
    stallIds.push(id);
    await pool.query(
      `INSERT INTO vendors (id, email, display_name, given_name)
       VALUES (?, ?, ?, ?)`,
      [id, stall.email, stall.displayName, stall.displayName.split(" ")[0]],
    );
  }
  for (let i = 0; i < FOOD_MEALS.length; i++) {
    const p = FOOD_MEALS[i]!;
    const ownerId = stallIds[i % stallIds.length]!;
    await pool.query(
      `INSERT INTO products (id, slug, name, description, price_ksh, stock, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), ...p, ownerId],
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
