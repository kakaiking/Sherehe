/** localStorage envelope for GET payloads (no session tokens). */

export const CACHE_PREFIX = "sherehe:v1";
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheRecord = {
  value: unknown;
  fetchedAt: string;
};

function storageKey(uid: string, collection: string): string {
  return `${CACHE_PREFIX}:${uid}:${collection}`;
}

function listCacheKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${CACHE_PREFIX}:`)) keys.push(key);
    }
  } catch {
    /* private mode / blocked storage */
  }
  return keys;
}

function parseRecord(raw: string): CacheRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("fetchedAt" in parsed) || typeof parsed.fetchedAt !== "string") {
      return null;
    }
    if (!("value" in parsed)) return null;
    return { value: parsed.value, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function readKey(key: string): CacheRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parseRecord(raw);
  } catch {
    return null;
  }
}

function evictOldest(): boolean {
  const scored = listCacheKeys().map((key) => {
    const entry = readKey(key);
    return { key, at: entry?.fetchedAt ? Date.parse(entry.fetchedAt) : 0 };
  });
  scored.sort((a, b) => a.at - b.at);
  const victim = scored[0];
  if (!victim) return false;
  try {
    localStorage.removeItem(victim.key);
    return true;
  } catch {
    return false;
  }
}

function writeKey(key: string, entry: CacheRecord): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(entry);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      localStorage.setItem(key, payload);
      return;
    } catch (err) {
      const quota =
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22);
      if (!quota) return;
      if (!evictOldest()) return;
    }
  }
}

export const cacheManager = {
  isStale(entry: CacheRecord | null): boolean {
    if (!entry?.fetchedAt) return true;
    const at = Date.parse(entry.fetchedAt);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at > CACHE_MAX_AGE_MS;
  },

  read(uid: string, collection: string): CacheRecord | null {
    return readKey(storageKey(uid, collection));
  },

  write(uid: string, collection: string, value: unknown): void {
    writeKey(storageKey(uid, collection), {
      value,
      fetchedAt: new Date().toISOString(),
    });
  },

  remove(uid: string, collection: string): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(storageKey(uid, collection));
    } catch {
      /* ignore */
    }
  },

  /** Drop every cache row, or only those for one uid. */
  clearAll(uid?: string): void {
    if (typeof window === "undefined") return;
    try {
      const prefix =
        uid !== undefined ? `${CACHE_PREFIX}:${uid}:` : `${CACHE_PREFIX}:`;
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  },

  keysFor(uid: string): string[] {
    const prefix = `${CACHE_PREFIX}:${uid}:`;
    return listCacheKeys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  },
};
