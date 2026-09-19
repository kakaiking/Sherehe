import { describe, expect, it } from "vitest";
import { CACHE_PREFIX, cacheManager } from "./cacheManager";

describe("cacheManager", () => {
  it("round-trips a JSON payload for a user and collection", () => {
    cacheManager.write("u1", "catalog:tickets", { offerings: [{ code: "early_bird" }] });
    const rec = cacheManager.read("u1", "catalog:tickets");
    expect(rec?.value).toEqual({ offerings: [{ code: "early_bird" }] });
    expect(typeof rec?.fetchedAt).toBe("string");
    expect(localStorage.getItem(`${CACHE_PREFIX}:u1:catalog:tickets`)).toMatch(/offerings/);
  });

  it("does not leak one user's rows into another", () => {
    cacheManager.write("u1", "account:orders", { orders: [1] });
    cacheManager.write("u2", "account:orders", { orders: [2] });
    expect(cacheManager.read("u1", "account:orders")?.value).toEqual({ orders: [1] });
    expect(cacheManager.read("u2", "account:orders")?.value).toEqual({ orders: [2] });
  });

  it("clears only the named uid", () => {
    cacheManager.write("u1", "a", 1);
    cacheManager.write("u2", "a", 2);
    cacheManager.clearAll("u1");
    expect(cacheManager.read("u1", "a")).toBeNull();
    expect(cacheManager.read("u2", "a")?.value).toBe(2);
  });

  it("treats a missing fetchedAt as stale", () => {
    expect(cacheManager.isStale(null)).toBe(true);
  });
});
