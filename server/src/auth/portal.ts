export const PORTALS = ["user"] as const;

export type Portal = (typeof PORTALS)[number];

/** Cookie / header gates. Public sign-in is Guest only; Admin is `/admin`. */
export const SESSION_KINDS = ["user", "admin"] as const;

export type SessionKind = (typeof SESSION_KINDS)[number];

export type UserRole = "customer" | "staff" | "partner" | "vendor";

/** Guest gate always creates a customer role. Staff is never chosen here. */
export function portalRole(_portal: Portal): Exclude<UserRole, "staff"> {
  return "customer";
}

export function parsePortal(raw: unknown): Portal | null {
  if (raw === "user") return raw;
  return null;
}

export function parseSessionKind(raw: unknown): SessionKind | null {
  if (raw === "admin") return "admin";
  return parsePortal(raw);
}

/** DB sessions.account_kind — admin cookies still point at the users table. */
export function dbAccountKind(kind: SessionKind): Portal {
  return "user";
}

/**
 * Staff may use the user gate (guest You) or the admin gate (ops).
 * Partner and vendor roles no longer have a public portal.
 */
export function roleMatchesPortal(role: UserRole, portal: SessionKind): boolean {
  if (role === "staff") return portal === "user" || portal === "admin";
  if (portal === "admin") return false;
  return role === "customer" && portal === "user";
}
