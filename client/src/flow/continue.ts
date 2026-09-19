const STORAGE_KEY = "sherehe.continuePath";

const EXACT_PATHS = new Set([
  "/tickets",
  "/shop",
  "/vendors",
  "/services",
  "/partners",
  "/account",
]);

/**
 * Allow only in-app paths after sign-in. Reject protocol-relative and
 * off-site URLs so a crafted continue value cannot bounce the browser away.
 */
export function isSafeContinuePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("://")) return false;
  const pathname = path.split("?")[0] ?? "";
  if (EXACT_PATHS.has(pathname)) return true;
  return pathname.startsWith("/orders/") && pathname.length > "/orders/".length;
}

export function saveContinue(path: string): void {
  if (!isSafeContinuePath(path)) return;
  sessionStorage.setItem(STORAGE_KEY, path);
}

export function takeContinue(): string | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if (raw === null || !isSafeContinuePath(raw)) return null;
  return raw;
}

/** After a completed sign-in, resume checkout or land on home. */
export function afterAuthPath(): string {
  return takeContinue() ?? "/";
}

export function continuePath(
  pathname: string,
  pick: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(extra);
  params.set("pick", pick);
  return `${pathname}?${params.toString()}`;
}
