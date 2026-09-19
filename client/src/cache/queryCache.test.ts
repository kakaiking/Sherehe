import { describe, expect, it, vi } from "vitest";
import { cacheManager } from "./cacheManager";
import {
  FRESH_MS,
  loadQuery,
  peekQuery,
  PUBLIC_UID,
  queryKeys,
  resetPrivateCache,
  SESSION_UID,
  setCacheUid,
  writeQuery,
} from "./queryCache";

describe("queryCache", () => {
  it("skips the network on a fresh in-memory hit", async () => {
    const fetcher = vi.fn(async () => ({ n: 1 }));
    await loadQuery(PUBLIC_UID, queryKeys.tickets, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await loadQuery(PUBLIC_UID, queryKeys.tickets, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("revalidates from the network after a disk-only paint", async () => {
    cacheManager.write(PUBLIC_UID, queryKeys.tickets, { offerings: [] });
    const peeked = peekQuery<{ offerings: unknown[] }>(PUBLIC_UID, queryKeys.tickets);
    expect(peeked.hit && peeked.from === "disk").toBe(true);
    const fetcher = vi.fn(async () => ({ offerings: [{ code: "regular" }] }));
    const value = await loadQuery(PUBLIC_UID, queryKeys.tickets, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(value).toEqual({ offerings: [{ code: "regular" }] });
  });

  it("coalesces concurrent loads for the same key", async () => {
    let resolve!: (v: { ok: boolean }) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((r) => {
          resolve = r;
        }),
    );
    const a = loadQuery(PUBLIC_UID, "k", fetcher);
    const b = loadQuery(PUBLIC_UID, "k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve({ ok: true });
    expect(await a).toEqual({ ok: true });
    expect(await b).toEqual({ ok: true });
  });

  it("force reload ignores the fresh window", async () => {
    const fetcher = vi.fn(async () => ({ n: Date.now() }));
    await loadQuery("u", "staff:overview", fetcher);
    await loadQuery("u", "staff:overview", fetcher, { force: true, freshMs: FRESH_MS });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("markStale keeps the payload and forces the next load", async () => {
    const fetcher = vi.fn(async () => ({ n: fetcher.mock.calls.length + 1 }));
    await loadQuery(PUBLIC_UID, "stale-demo", fetcher);
    const { markStale } = await import("./queryCache");
    markStale(PUBLIC_UID, "stale-demo");
    await loadQuery(PUBLIC_UID, "stale-demo", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(peekQuery(PUBLIC_UID, "stale-demo")).toMatchObject({ hit: true });
  });

  it("keeps public catalog rows when private cache is reset", () => {
    writeQuery(PUBLIC_UID, queryKeys.tickets, { offerings: [1] });
    writeQuery(SESSION_UID, queryKeys.me, { id: "u1" });
    setCacheUid("u1");
    writeQuery("u1", queryKeys.accountOrders, { orders: [] });
    resetPrivateCache();
    expect(peekQuery(PUBLIC_UID, queryKeys.tickets)).toMatchObject({
      hit: true,
      value: { offerings: [1] },
    });
    expect(peekQuery(SESSION_UID, queryKeys.me).hit).toBe(false);
    expect(peekQuery("u1", queryKeys.accountOrders).hit).toBe(false);
  });
});
