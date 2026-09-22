import type { UserRole } from "./portal.js";

/**
 * Identity table for sessions/orders. Public portals are Guest-only now, but
 * order rows and legacy sessions may still reference partner/vendor tables.
 */
export type AccountKind = "user" | "partner" | "vendor";

export type AccountTable = "users" | "partners" | "vendors";

/** Maps a gate to its row table. Never interpolate unparsed input into SQL. */
export function accountTable(kind: AccountKind): AccountTable {
  if (kind === "partner") return "partners";
  if (kind === "vendor") return "vendors";
  return "users";
}

/** Role stored on the session for a newly created portal account. */
export function roleForAccountKind(kind: AccountKind): Exclude<UserRole, "staff"> {
  return kind === "user" ? "customer" : kind;
}

export const ACCOUNT_PROFILE_SQL =
  "id, email, google_sub, phone, display_name, given_name";

/**
 * Order/ticket buyer profile: the same Google email can own a row in each
 * table, so joins must follow `orders.account_kind`, not a global email.
 */
export const ORDER_BUYER_JOINS = `
LEFT JOIN users u ON o.account_kind = 'user' AND u.id = o.user_id
LEFT JOIN partners p ON o.account_kind = 'partner' AND p.id = o.user_id
LEFT JOIN vendors v ON o.account_kind = 'vendor' AND v.id = o.user_id`;

export const ORDER_BUYER_DISPLAY = `COALESCE(u.display_name, p.display_name, v.display_name)`;
export const ORDER_BUYER_GIVEN = `COALESCE(u.given_name, p.given_name, v.given_name)`;
export const ORDER_BUYER_EMAIL = `COALESCE(u.email, p.email, v.email)`;
export const ORDER_BUYER_PHONE = `COALESCE(u.phone, p.phone, v.phone)`;
