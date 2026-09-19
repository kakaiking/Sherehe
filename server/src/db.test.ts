import { describe, expect, it } from "vitest";
import { isSelectSql, mysqlToPg } from "./db.js";

describe("mysqlToPg", () => {
  it("rewrites positional placeholders in order", () => {
    expect(mysqlToPg("SELECT id FROM users WHERE email = ? AND role = ?")).toBe(
      "SELECT id FROM users WHERE email = $1 AND role = $2",
    );
  });

  it("leaves SQL without placeholders unchanged", () => {
    expect(mysqlToPg("SELECT id FROM events LIMIT 1")).toBe("SELECT id FROM events LIMIT 1");
  });
});

describe("isSelectSql", () => {
  it("treats SELECT … FOR UPDATE as a row-returning query", () => {
    expect(isSelectSql("SELECT id FROM orders WHERE id = ? FOR UPDATE")).toBe(true);
  });

  it("treats writes as non-select", () => {
    expect(isSelectSql("UPDATE orders SET status = 'paid' WHERE id = ?")).toBe(false);
    expect(isSelectSql("DELETE FROM sessions WHERE id = ?")).toBe(false);
  });
});
