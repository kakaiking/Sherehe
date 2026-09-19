import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiError } from "../api";
import {
  FRESH_MS,
  isMemoryFresh,
  loadQuery,
  peekQuery,
  subscribeQuery,
} from "./queryCache";

export type CachedQuery<T> = {
  data: T | undefined;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

function errorDetail(err: unknown): string {
  if (typeof err === "object" && err !== null && "detail" in err) {
    const detail = (err as ApiError).detail;
    if (typeof detail === "string") return detail;
  }
  return "Could not load.";
}

/**
 * Paint from localStorage/memory immediately; hit the API only on a miss
 * or when the in-memory copy is older than `freshMs`. Disk hits always
 * revalidate in the background (DB sync) without a skeleton.
 */
export function useApiQuery<T>(
  key: string,
  path: string,
  options?: {
    enabled?: boolean;
    uid?: string;
    freshMs?: number;
  },
): CachedQuery<T> {
  const uid = options?.uid ?? "anon";
  const enabled = options?.enabled ?? true;
  const freshMs = options?.freshMs ?? FRESH_MS;
  const [data, setData] = useState<T | undefined>(() => {
    if (!enabled) return undefined;
    const peeked = peekQuery<T>(uid, key);
    return peeked.hit ? peeked.value : undefined;
  });
  const [loading, setLoading] = useState(() => {
    if (!enabled) return false;
    return !peekQuery<T>(uid, key).hit;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const applyPeek = useCallback(() => {
    const peeked = peekQuery<T>(uid, key);
    if (peeked.hit) setData(peeked.value);
    else setData(undefined);
  }, [uid, key]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const peeked = peekQuery<T>(uid, key);
    if (!peeked.hit) setLoading(true);
    else setRefreshing(true);
    try {
      const value = await loadQuery<T>(
        uid,
        key,
        () => api<T>(pathRef.current),
        { force: true, freshMs },
      );
      setData(value);
      setError(null);
    } catch (err) {
      if (!peeked.hit) setError(errorDetail(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled, uid, key, freshMs]);

  useEffect(() => {
    if (!enabled) return;
    applyPeek();
    const unsub = subscribeQuery(uid, key, applyPeek);
    const peeked = peekQuery<T>(uid, key);
    if (peeked.hit) {
      setData(peeked.value);
      setLoading(false);
    }
    if (peeked.hit && peeked.from === "memory" && isMemoryFresh(uid, key, freshMs)) {
      return () => {
        unsub();
      };
    }
    let cancelled = false;
    if (!peeked.hit) setLoading(true);
    else setRefreshing(true);
    void loadQuery<T>(uid, key, () => api<T>(pathRef.current), {
      freshMs,
    })
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!peekQuery<T>(uid, key).hit) setError(errorDetail(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [applyPeek, enabled, freshMs, key, path, uid]);

  return { data, loading, refreshing, error, reload };
}
