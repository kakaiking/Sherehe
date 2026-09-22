import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Pool } from "../db.js";
import type { Config } from "../config.js";
import type { AccountKind } from "./accounts.js";
import { ORDER_BUYER_EMAIL } from "./accounts.js";
import {
  dbAccountKind,
  parseSessionKind,
  type SessionKind,
} from "./portal.js";

/** Legacy single-cookie name; cleared on create/destroy so old tabs cannot fight. */
export const LEGACY_SESSION_COOKIE = "sherehe_sid";
const CSRF_COOKIE = "sherehe_csrf";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const PORTAL_HEADER = "x-sherehe-portal";

export type SessionUser = {
  id: string;
  kind: AccountKind;
  email: string;
  phone: string | null;
  role: "customer" | "staff" | "partner" | "vendor";
  display_name: string | null;
  given_name: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      csrfToken?: string;
      portal?: SessionKind;
    }
  }
}

export function sessionCookieName(kind: SessionKind): string {
  return `sherehe_sid_${kind}`;
}

function cookieOpts(config: Config): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS,
  };
}

function clearLegacyCookie(res: Response, config: Config): void {
  res.clearCookie(LEGACY_SESSION_COOKIE, { ...cookieOpts(config), maxAge: 0 });
}

/**
 * Pick which portal cookie to load: explicit header wins; otherwise the sole
 * present cookie; if several exist, prefer user (never auto-pick admin).
 */
export function resolveSessionPortal(
  cookies: Record<string, string | undefined>,
  headerRaw: string | undefined,
): SessionKind {
  const fromHeader = parseSessionKind(headerRaw);
  if (fromHeader) return fromHeader;

  const present = (["user", "admin"] as const).filter(
    (k) => Boolean(cookies[sessionCookieName(k)]),
  );
  if (present.length === 1) return present[0]!;
  const guest = present.filter((k) => k !== "admin");
  if (guest.length === 1) return guest[0]!;
  return "user";
}

export async function createSession(
  pool: Pool,
  res: Response,
  config: Config,
  userId: string,
  kind: SessionKind = "user",
  req?: Request,
): Promise<void> {
  const cookies = (req?.cookies ?? {}) as Record<string, string | undefined>;
  const name = sessionCookieName(kind);
  const previous = cookies[name];
  if (previous) {
    await pool.query("DELETE FROM sessions WHERE id = ?", [previous]);
  }
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MS);
  const accountKind = dbAccountKind(kind);
  await pool.query(
    "INSERT INTO sessions (id, account_kind, user_id, expires_at) VALUES (?, ?, ?, ?)",
    [id, accountKind, userId, expires],
  );
  res.cookie(name, id, cookieOpts(config));
  clearLegacyCookie(res, config);
}

export async function destroySession(
  pool: Pool,
  req: Request,
  res: Response,
  config: Config,
  kind?: SessionKind,
): Promise<void> {
  const cookies = req.cookies as Record<string, string | undefined>;
  const portal =
    kind ??
    req.portal ??
    resolveSessionPortal(cookies, req.get(PORTAL_HEADER) ?? undefined);
  const name = sessionCookieName(portal);
  const sid = cookies[name] ?? cookies[LEGACY_SESSION_COOKIE];
  if (sid) {
    await pool.query("DELETE FROM sessions WHERE id = ?", [sid]);
  }
  res.clearCookie(name, { ...cookieOpts(config), maxAge: 0 });
  clearLegacyCookie(res, config);
}

export function csrfMiddleware(config: Config) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookies = req.cookies as Record<string, string | undefined>;
    let token = cookies[CSRF_COOKIE];
    if (!token) {
      token = randomBytes(24).toString("hex");
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MS,
      });
    }
    req.csrfToken = token;
    next();
  };
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const header = req.get("x-csrf-token");
  if (!req.csrfToken || !header || header !== req.csrfToken) {
    res.status(403).json({
      type: "https://httpstatuses.com/403",
      title: "Forbidden",
      status: 403,
      detail: "Missing or invalid CSRF token. Refresh and try again.",
    });
    return;
  }
  next();
}

export function loadUser(pool: Pool) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const cookies = req.cookies as Record<string, string | undefined>;
      const portal = resolveSessionPortal(
        cookies,
        req.get(PORTAL_HEADER) ?? undefined,
      );
      req.portal = portal;
      const sid =
        cookies[sessionCookieName(portal)] ?? cookies[LEGACY_SESSION_COOKIE];
      if (!sid) {
        next();
        return;
      }
      const [rows] = await pool.query(
        `SELECT s.account_kind AS kind,
                COALESCE(u.id, p.id, v.id) AS id,
                ${ORDER_BUYER_EMAIL} AS email,
                COALESCE(u.phone, p.phone, v.phone) AS phone,
                CASE
                  WHEN u.id IS NOT NULL THEN u.role
                  WHEN p.id IS NOT NULL THEN 'partner'
                  ELSE 'vendor'
                END AS role,
                COALESCE(u.display_name, p.display_name, v.display_name) AS display_name,
                COALESCE(u.given_name, p.given_name, v.given_name) AS given_name
         FROM sessions s
         LEFT JOIN users u ON s.account_kind = 'user' AND u.id = s.user_id
         LEFT JOIN partners p ON s.account_kind = 'partner' AND p.id = s.user_id
         LEFT JOIN vendors v ON s.account_kind = 'vendor' AND v.id = s.user_id
         WHERE s.id = ? AND s.expires_at > NOW()`,
        [sid],
      );
      const list = rows as SessionUser[];
      const user = list[0];
      if (user?.id) {
        req.user = user;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      type: "https://httpstatuses.com/401",
      title: "Unauthorized",
      status: 401,
      detail: "Sign in to continue.",
    });
    return;
  }
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "staff" || req.portal !== "admin") {
    res.status(403).json({
      type: "https://httpstatuses.com/403",
      title: "Forbidden",
      status: 403,
      detail: "Staff access required.",
    });
    return;
  }
  next();
}

export function requireVendor(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "vendor") {
    res.status(403).json({
      type: "https://httpstatuses.com/403",
      title: "Forbidden",
      status: 403,
      detail: "Vendor portal access required.",
    });
    return;
  }
  next();
}

export function requirePartner(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "partner") {
    res.status(403).json({
      type: "https://httpstatuses.com/403",
      title: "Forbidden",
      status: 403,
      detail: "Partner portal access required.",
    });
    return;
  }
  next();
}
