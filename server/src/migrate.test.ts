import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyTrackedMigrations, type MigrationQuery } from "./migrate.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function memoryPool(applied: Set<string>): {
  pool: MigrationQuery;
  executedSql: string[];
} {
  const executedSql: string[] = [];
  const pool: MigrationQuery = {
    async query(sql: string, params: unknown[] = []) {
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)) {
        return [[]];
      }
      if (sql.startsWith("SELECT id FROM schema_migrations")) {
        const id = String(params[0] ?? "");
        return [applied.has(id) ? [{ id }] : []];
      }
      if (sql.startsWith("INSERT INTO schema_migrations")) {
        applied.add(String(params[0] ?? ""));
        return [[{ affectedRows: 1 }]];
      }
      executedSql.push(sql);
      return [[]];
    },
  };
  return { pool, executedSql };
}

describe("applyTrackedMigrations", () => {
  it("skips already-applied 001 so later files can add columns the new 001 indexes", async () => {
    const poison001 =
      "CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions (account_kind, user_id)";
    const addColumn002 =
      "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS account_kind VARCHAR(16)";
    const { pool, executedSql } = memoryPool(new Set(["001_init"]));

    const ran = await applyTrackedMigrations(pool, [
      { id: "001_init", sql: poison001 },
      { id: "002_portal_accounts", sql: addColumn002 },
    ]);

    expect(ran).toEqual(["002_portal_accounts"]);
    expect(executedSql).toEqual([addColumn002]);
    expect(executedSql).not.toContain(poison001);
  });

  it("runs 001 then 002 on an empty schema_migrations table", async () => {
    const { pool, executedSql } = memoryPool(new Set());
    const ran = await applyTrackedMigrations(pool, [
      { id: "001_init", sql: "CREATE TABLE sessions" },
      { id: "002_portal_accounts", sql: "ALTER TABLE sessions ADD COLUMN account_kind" },
    ]);
    expect(ran).toEqual(["001_init", "002_portal_accounts"]);
    expect(executedSql).toHaveLength(2);
  });
});

describe("migration files stay upgrade-safe", () => {
  it("does not special-case 001_init into an always-run path", () => {
    const src = readFileSync(join(repoRoot, "server/src/migrate.ts"), "utf8");
    expect(src).not.toMatch(/if \(id === ["']001_init["']\)/);
  });

  it("adds account_kind in 002 before creating indexes on it", () => {
    const sql = readFileSync(join(repoRoot, "db/migrations/002_portal_accounts.sql"), "utf8");
    const add = sql.indexOf("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS account_kind");
    const idx = sql.indexOf("CREATE INDEX IF NOT EXISTS idx_sessions_account");
    expect(add).toBeGreaterThan(0);
    expect(idx).toBeGreaterThan(add);
  });

  it("guards 001 account_kind indexes so a re-run cannot crash on old tables", () => {
    const sql = readFileSync(join(repoRoot, "db/migrations/001_init.sql"), "utf8");
    expect(sql).toMatch(/table_name = 'sessions' AND column_name = 'account_kind'/);
    expect(sql).toMatch(/table_name = 'orders' AND column_name = 'account_kind'/);
    expect(sql).not.toMatch(
      /^\s*CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions \(account_kind/m,
    );
  });
});
