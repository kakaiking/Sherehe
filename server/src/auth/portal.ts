export const PORTALS = ["user", "partner", "vendor"] as const;

export type Portal = (typeof PORTALS)[number];

export type UserRole = "customer" | "staff" | "partner" | "vendor";

/** Maps a sign-in gate to the account role it creates. Staff is never chosen here. */
export function portalRole(portal: Portal): Exclude<UserRole, "staff"> {
  return portal === "user" ? "customer" : portal;
}

export function parsePortal(raw: unknown): Portal | null {
  if (raw === "user" || raw === "partner" || raw === "vendor") return raw;
  return null;
}

/**
 * Staff share the guest (user) gate. Partner and vendor each have their own
 * identity table, so the same email can sign in on every gate.
 */
export function roleMatchesPortal(role: UserRole, portal: Portal): boolean {
  if (role === "staff") return portal === "user";
  return portalRole(portal) === role;
}
