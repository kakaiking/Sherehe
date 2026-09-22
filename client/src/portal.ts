export const PORTALS = ["user"] as const;

export type SignInPortal = (typeof PORTALS)[number];

/** Session cookie / header gates. Public sign-in is Guest only; Admin is `/admin`. */
export const SESSION_KINDS = ["user", "admin"] as const;

export type Portal = (typeof SESSION_KINDS)[number];

export type UserRole = "customer" | "staff" | "partner" | "vendor";

const STORAGE_KEY = "sherehe.portal";

export const PORTAL_HEADER = "X-Sherehe-Portal";

export function parsePortal(raw: unknown): Portal | null {
  if (raw === "user" || raw === "admin") return raw;
  return null;
}

export function parseSignInPortal(raw: unknown): SignInPortal | null {
  if (raw === "user") return raw;
  return null;
}

export function readStoredPortal(): Portal {
  try {
    return parsePortal(sessionStorage.getItem(STORAGE_KEY)) ?? "user";
  } catch {
    return "user";
  }
}

export function storePortal(portal: Portal): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, portal);
  } catch {
    /* private mode */
  }
}

export function portalLabel(portal: Portal): string {
  return portal === "admin" ? "Admin" : "Guest";
}

/** Snackbar copy after a successful Google sign-in for a given gate. */
export function signedInMessage(portal: Portal): string {
  return portal === "admin"
    ? "Signed in as an admin."
    : "Signed in as a guest.";
}

/** Land here after sign-in when there is no continue path. */
export function homeForPortal(portal: Portal): string {
  return portal === "admin" ? "/admin" : "/guest";
}

/** Sign-in screen may keep the Guest gate while OAuth returns. */
export function isSignInPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register";
}

/**
 * Route → session gate from the portal URL prefix.
 * `/guest…` owns the guest cookie; `/admin` admin.
 */
export function portalForPath(pathname: string): Portal | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/guest" || pathname.startsWith("/guest/")) return "user";
  return null;
}

export function syncPortalFromPath(pathname: string): Portal {
  const fromPath = portalForPath(pathname);
  if (fromPath) {
    storePortal(fromPath);
    return fromPath;
  }
  if (isSignInPath(pathname)) {
    storePortal("user");
    return "user";
  }
  storePortal("user");
  return "user";
}
