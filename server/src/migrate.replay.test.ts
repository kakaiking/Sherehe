import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Config } from "./config.js";
import { Pool } from "./db.js";
import { applyTrackedMigrations, loadTrackedMigrationFiles } from "./migrate.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const replayUrl = process.env["MIGRATE_REPLAY_DATABASE_URL"]?.trim();

function hasColumn(
  rows: Array<Record<string, unknown>>,
  name: string,
): boolean {
  return rows.some((r) => r["column_name"] === name);
}

describe.skipIf(!replayUrl)("migrate replay from pre-portal 001", () => {
  it("adds account_kind on a live 001 schema without crashing boot", async () => {
    const url = replayUrl;
    if (!url) throw new Error("MIGRATE_REPLAY_DATABASE_URL");
    const pool = new Pool({ DATABASE_URL: url } as Config);
    try {
      await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
      await pool.query("CREATE SCHEMA public");
      const legacy = readFileSync(
        join(repoRoot, "db/fixtures/legacy-001-before-account-kind.sql"),
        "utf8",
      );
      await pool.query(legacy);
      await pool.query("INSERT INTO schema_migrations (id) VALUES (?)", ["001_init"]);
      const files = await loadTrackedMigrationFiles();
      const ran = await applyTrackedMigrations(pool, files);
      expect(ran).toContain("002_portal_accounts");
      expect(ran).not.toContain("001_init");
      const [sessionCols] = await pool.query<Array<Record<string, unknown>>>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'sessions'`,
      );
      const [orderCols] = await pool.query<Array<Record<string, unknown>>>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'orders'`,
      );
      expect(hasColumn(sessionCols, "account_kind")).toBe(true);
      expect(hasColumn(orderCols, "account_kind")).toBe(true);
    } finally {
      await pool.end();
    }
  });
});
