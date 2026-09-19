import { cacheManager } from "./cacheManager";

/** Skip the network on in-memory hits newer than this. Disk hits always revalidate. */
export const FRESH_MS = 45_000;

export const queryKeys = {
  me: "me",
  event: "catalog:event",
  tickets: "catalog:tickets",
  products: (page: number, stallId = "") =>
    stallId ? `commerce:products:${stallId}:${page}` : `commerce:products:${page}`,
  stalls: "commerce:stalls",
  services: "commerce:services",
  vendors: "vendors:packages",
  accountOrders: "account:orders",
  order: (id: string) => `orders:${id}`,
  staff: "staff:overview",
  productSales: (sku: string) => `commerce:sales:${sku}`,
} as const;

export const PUBLIC_UID = "anon";
export const SESSION_UID = "session";

type MemoryEntry = {
  value: unknown;
  fetchedAt: number;
};

export type PeekHit<T> = {
  hit: true;
  value: T;
  from: "memory" | "disk";
  fetchedAt: number;
};

export type PeekMiss = { hit: false };

export type PeekResult<T> = PeekHit<T> | PeekMiss;

const memory = new Map<string, MemoryEntry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

let cacheUid = PUBLIC_UID;

function memKey(uid: string, collection: string): string {
  return `${uid}:${collection}`;
}

function notify(uid: string, collection: string): void {
  const set = listeners.get(memKey(uid, collection));
  if (!set) return;
  for (const cb of set) {
    try {
      cb();
    } catch {
      /* subscriber errors must not break others */
    }
  }
}

export function setCacheUid(uid: string | null | undefined): void {
  cacheUid = uid && uid.length > 0 ? uid : PUBLIC_UID;
}

export function getCacheUid(): string {
  return cacheUid;
}

export function peekQuery<T>(uid: string, collection: string): PeekResult<T> {
  const k = memKey(uid, collection);
  const mem = memory.get(k);
  if (mem) {
    return {
      hit: true,
      value: mem.value as T,
      from: "memory",
      fetchedAt: mem.fetchedAt,
    };
  }
  const disk = cacheManager.read(uid, collection);
  if (!disk) return { hit: false };
  const fetchedAt = Date.parse(disk.fetchedAt);
  const at = Number.isFinite(fetchedAt) ? fetchedAt : 0;
  return {
    hit: true,
    value: disk.value as T,
    from: "disk",
    fetchedAt: at,
  };
}

export function isMemoryFresh(
  uid: string,
  collection: string,
  freshMs: number,
): boolean {
  const mem = memory.get(memKey(uid, collection));
  if (!mem) return false;
  return Date.now() - mem.fetchedAt < freshMs;
}

export function writeQuery(uid: string, collection: string, value: unknown): void {
  const fetchedAt = Date.now();
  memory.set(memKey(uid, collection), { value, fetchedAt });
  cacheManager.write(uid, collection, value);
  notify(uid, collection);
}

export function subscribeQuery(
  uid: string,
  collection: string,
  cb: () => void,
): () => void {
  const k = memKey(uid, collection);
  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(k);
  };
}

function coalesce<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = task().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

export async function loadQuery<T>(
  uid: string,
  collection: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean; freshMs?: number },
): Promise<T> {
  const freshMs = options?.freshMs ?? FRESH_MS;
  if (!options?.force && isMemoryFresh(uid, collection, freshMs)) {
    const peeked = peekQuery<T>(uid, collection);
    if (peeked.hit) return peeked.value;
  }
  const k = memKey(uid, collection);
  return coalesce(k, async () => {
    const value = await fetcher();
    writeQuery(uid, collection, value);
    return value;
  });
}

export function markStale(uid: string, collection: string): void {
  const k = memKey(uid, collection);
  const mem = memory.get(k);
  if (mem) {
    memory.set(k, { value: mem.value, fetchedAt: 0 });
    return;
  }
  const disk = cacheManager.read(uid, collection);
  if (disk) {
    memory.set(k, { value: disk.value, fetchedAt: 0 });
  }
}

export function markPrefixStale(uid: string, prefix: string): void {
  const seen = new Set<string>();
  for (const k of [...memory.keys()]) {
    if (!k.startsWith(`${uid}:${prefix}`)) continue;
    const mem = memory.get(k);
    if (!mem) continue;
    memory.set(k, { value: mem.value, fetchedAt: 0 });
    seen.add(k.slice(`${uid}:`.length));
  }
  for (const collection of cacheManager.keysFor(uid)) {
    if (!collection.startsWith(prefix) || seen.has(collection)) continue;
    const disk = cacheManager.read(uid, collection);
    if (disk) {
      memory.set(memKey(uid, collection), { value: disk.value, fetchedAt: 0 });
    }
  }
}

export function invalidateQuery(uid: string, collection: string): void {
  memory.delete(memKey(uid, collection));
  inflight.delete(memKey(uid, collection));
  cacheManager.remove(uid, collection);
  notify(uid, collection);
}

export function invalidatePrefix(uid: string, prefix: string): void {
  for (const k of [...memory.keys()]) {
    if (k.startsWith(`${uid}:${prefix}`)) {
      memory.delete(k);
      inflight.delete(k);
    }
  }
  for (const collection of cacheManager.keysFor(uid)) {
    if (collection.startsWith(prefix)) {
      cacheManager.remove(uid, collection);
      notify(uid, collection);
    }
  }
}

/**
 * Drop session and per-user GET snapshots. Public catalog rows stay so
 * Home / Tickets / Shop do not flash skeletons after sign-out.
 */
export function resetPrivateCache(): void {
  const uid = cacheUid;
  for (const k of [...memory.keys()]) {
    if (!k.startsWith(`${PUBLIC_UID}:`)) {
      memory.delete(k);
      inflight.delete(k);
    }
  }
  cacheManager.clearAll(SESSION_UID);
  if (uid !== PUBLIC_UID) cacheManager.clearAll(uid);
  cacheUid = PUBLIC_UID;
}

/** Drop every GET snapshot (tests / full wipe). */
export function resetLocalCache(): void {
  memory.clear();
  inflight.clear();
  cacheManager.clearAll();
  cacheUid = PUBLIC_UID;
  for (const set of listeners.values()) {
    for (const cb of set) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }
}
