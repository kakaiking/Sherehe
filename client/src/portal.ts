export const PORTALS = ["user", "partner", "vendor"] as const;

export type Portal = (typeof PORTALS)[number];

export type UserRole = "customer" | "staff" | "partner" | "vendor";

const STORAGE_KEY = "sherehe.portal";

export function parsePortal(raw: unknown): Portal | null {
  if (raw === "user" || raw === "partner" || raw === "vendor") return raw;
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
