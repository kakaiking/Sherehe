import { z } from "zod";
import { Router } from "express";
import type { Pool, RowDataPacket } from "../db.js";
import { isUniqueViolation } from "../db.js";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import { googleOAuthConfig } from "../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import { normalizeKenyanPhone } from "../phone.js";
import { createSession, destroySession } from "./session.js";
import { log } from "../log.js";
import {
  exchangeGoogleCode,
  planGoogleAccount,
  verifyGoogleIdToken,
  type GoogleUserRow,
} from "./google.js";
import {
  googleCallbackErrorCode,
  googleCallbackHandoff,
  googleProviderErrorCode,
  type GoogleLoginError,
} from "./google-errors.js";
import {
  parsePortal,
  type UserRole,
} from "./portal.js";
import {
  ACCOUNT_PROFILE_SQL,
  accountTable,
  roleForAccountKind,
  type AccountKind,
  type AccountTable,
} from "./accounts.js";

const RegisterBody = z.object({
  email: z.string().email().max(255),
  phone: z.string().min(9).max(20),
  password: z.string().min(10).max(200),
});

const LoginBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

const PhoneBody = z.object({
  phone: z.string().min(9).max(20),
});

const GoogleCallbackBody = z.object({
  code: z.string().min(8).max(8192),
  verifier: z.string().regex(/^[A-Za-z0-9\-._~]{43,128}$/),
  portal: z.enum(["user", "partner", "vendor"]).optional(),
});

function publicUser(user: {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  display_name: string | null;
  given_name: string | null;
}): {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  displayName: string | null;
  givenName: string | null;
} {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    displayName: user.display_name,
    givenName: user.given_name,
  };
}

function profileSelect(table: AccountTable): string {
  if (table === "users") {
    return `SELECT ${ACCOUNT_PROFILE_SQL}, role FROM users`;
  }
  return `SELECT ${ACCOUNT_PROFILE_SQL} FROM ${table}`;
}

function sessionRole(
  table: AccountTable,
  row: GoogleUserRow,
  kind: AccountKind,
): UserRole {
  if (table === "users") {
    return row.role ?? "customer";
  }
  return roleForAccountKind(kind);
}

function googleJsonStatus(code: GoogleLoginError): number {
  if (code === "google_conflict") return 409;
  if (code === "google_portal") return 403;
  if (code === "google_network") return 502;
  if (code === "google_off") return 503;
  return 400;
}

function googleJsonFail(
  res: { status: (n: number) => { json: (b: unknown) => void } },
  code: GoogleLoginError,
): void {
  const status = googleJsonStatus(code);
  const title =
    status === 409
      ? "Conflict"
      : status === 403
        ? "Forbidden"
        : status === 502
          ? "Bad Gateway"
          : status === 503
            ? "Service Unavailable"
            : "Bad Request";
  res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    detail: "Google sign-in did not complete.",
    code,
  });
}

export function authRouter(pool: Pool, config: Config): Router {
  const r = Router();

  r.get("/csrf", (req, res) => {
    res.json({ csrfToken: req.csrfToken ?? "" });
  });

  r.get("/me", (req, res) => {
    if (!req.user) {
      res.status(401).json({
        type: "https://httpstatuses.com/401",
        title: "Unauthorized",
        status: 401,
        detail: "Sign in to continue.",
      });
      return;
    }
    res.json(publicUser(req.user));
  });

  r.get("/google", (_req, res) => {
    const oauth = googleOAuthConfig(config);
    if (!oauth) {
      res.json({ enabled: false });
      return;
    }
    res.json({
      enabled: true,
      clientId: oauth.clientId,
      redirectUri: oauth.redirectUri,
    });
  });

  r.get("/google/callback", (req, res) => {
    const q = req.query as Record<string, unknown>;
    if (typeof q["error"] === "string") {
      log("warn", "google_auth_failed", {
        reason: googleProviderErrorCode(q["error"]),
      });
    }
    res.redirect(302, googleCallbackHandoff(q, config.CLIENT_ORIGIN));
  });

  r.post("/google/callback", async (req, res, next) => {
    const fail = (code: GoogleLoginError): void => {
      log("warn", "google_auth_failed", { reason: code });
      googleJsonFail(res, code);
    };
    try {
      const oauth = googleOAuthConfig(config);
      if (!oauth) {
        log("warn", "google_not_configured", {});
        fail("google_off");
        return;
      }
      const parsed = GoogleCallbackBody.safeParse(req.body);
      if (!parsed.success) {
        fail("google_state");
        return;
      }
      const portal = parsePortal(parsed.data.portal) ?? "user";
      const table = accountTable(portal);
      const intendedRole = roleForAccountKind(portal);
      const idToken = await exchangeGoogleCode(
        oauth,
        parsed.data.code,
        fetch,
        parsed.data.verifier,
      );
      const claims = await verifyGoogleIdToken(idToken, oauth.clientId, fetch);
      const [subRows] = await pool.query<RowDataPacket[]>(
        `${profileSelect(table)} WHERE google_sub = ?`,
        [claims.sub],
      );
      const [emailRows] = await pool.query<RowDataPacket[]>(
        `${profileSelect(table)} WHERE email = ?`,
        [claims.email],
      );
      const bySub = subRows[0] as GoogleUserRow | undefined;
      const byEmail = emailRows[0] as GoogleUserRow | undefined;
      const plan = planGoogleAccount(bySub, byEmail, claims.sub);
      let user: GoogleUserRow;
      if (plan === "conflict") {
        fail("google_conflict");
        return;
      }
      if (plan === "use-sub" && bySub) {
        if (claims.displayName) {
          await pool.query(
            `UPDATE ${table} SET display_name = ?, given_name = ? WHERE id = ?`,
            [claims.displayName, claims.givenName, bySub.id],
          );
          user = {
            ...bySub,
            display_name: claims.displayName,
            given_name: claims.givenName,
          };
        } else {
          user = bySub;
        }
      } else if (plan === "link-email" && byEmail) {
        await pool.query(
          `UPDATE ${table} SET google_sub = ?, display_name = COALESCE(?, display_name), given_name = COALESCE(?, given_name) WHERE id = ?`,
          [claims.sub, claims.displayName, claims.givenName, byEmail.id],
        );
        user = {
          ...byEmail,
          google_sub: claims.sub,
          display_name: claims.displayName ?? byEmail.display_name,
          given_name: claims.givenName ?? byEmail.given_name,
        };
      } else {
        const id = randomUUID();
        if (table === "users") {
          await pool.query(
            `INSERT INTO users (id, email, google_sub, phone, password_hash, role, display_name, given_name)
             VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`,
            [id, claims.email, claims.sub, intendedRole, claims.displayName, claims.givenName],
          );
        } else {
          await pool.query(
            `INSERT INTO ${table} (id, email, google_sub, phone, password_hash, display_name, given_name)
             VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
            [id, claims.email, claims.sub, claims.displayName, claims.givenName],
          );
        }
        user = {
          id,
          email: claims.email,
          google_sub: claims.sub,
          phone: null,
          role: intendedRole,
          display_name: claims.displayName,
          given_name: claims.givenName,
        };
      }
      user = { ...user, role: sessionRole(table, user, portal) };
      await createSession(pool, res, config, user.id, portal);
      res.json(publicUser({
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role ?? intendedRole,
        display_name: user.display_name,
        given_name: user.given_name,
      }));
    } catch (err) {
      const code = googleCallbackErrorCode(err);
      log("warn", "google_auth_failed", {
        reason: err instanceof Error ? err.message.slice(0, 40) : "unknown",
        code,
      });
      if (res.headersSent) {
        next(err);
        return;
      }
      googleJsonFail(res, code);
    }
  });

  r.post("/phone", async (req, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({
          type: "https://httpstatuses.com/401",
          title: "Unauthorized",
          status: 401,
          detail: "Sign in to continue.",
        });
        return;
      }
      const parsed = PhoneBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Use a Kenyan mobile number.",
        });
        return;
      }
      const phone = normalizeKenyanPhone(parsed.data.phone);
      if (!phone) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Use a Kenyan mobile number.",
        });
        return;
      }
      try {
        await pool.query(
          `UPDATE ${accountTable(req.user.kind)} SET phone = ? WHERE id = ?`,
          [phone, req.user.id],
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({
            type: "https://httpstatuses.com/409",
            title: "Conflict",
            status: 409,
            detail: "That mobile is already on another account.",
          });
          return;
        }
        throw err;
      }
      res.json(publicUser({ ...req.user, phone }));
    } catch (err) {
      next(err);
    }
  });

  r.post("/register", async (req, res, next) => {
    try {
      const parsed = RegisterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Check email, phone, and password (10+ characters).",
        });
        return;
      }
      const phone = normalizeKenyanPhone(parsed.data.phone);
      if (!phone) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Use a Kenyan mobile number.",
        });
        return;
      }
      const id = randomUUID();
      const passwordHash = await hashPassword(parsed.data.password);
      try {
        await pool.query(
          "INSERT INTO users (id, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'customer')",
          [id, parsed.data.email.toLowerCase(), phone, passwordHash],
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({
            type: "https://httpstatuses.com/409",
            title: "Conflict",
            status: 409,
            detail: "An account with that email or phone already exists.",
          });
          return;
        }
        throw err;
      }
      await createSession(pool, res, config, id, "user");
      res.status(201).json({
        id,
        email: parsed.data.email.toLowerCase(),
        phone,
        role: "customer",
        displayName: null,
        givenName: null,
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/login", async (req, res, next) => {
    try {
      const parsed = LoginBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Email and password are required.",
        });
        return;
      }
      const [rows] = await pool.query(
        "SELECT id, email, phone, password_hash, role, display_name, given_name FROM users WHERE email = ?",
        [parsed.data.email.toLowerCase()],
      );
      const user = (rows as Array<{
        id: string;
        email: string;
        phone: string | null;
        password_hash: string | null;
        role: UserRole;
        display_name: string | null;
        given_name: string | null;
      }>)[0];
      if (
        !user?.password_hash ||
        !(await verifyPassword(user.password_hash, parsed.data.password))
      ) {
        log("warn", "login_failed", { reason: "invalid_credentials" });
        res.status(401).json({
          type: "https://httpstatuses.com/401",
          title: "Unauthorized",
          status: 401,
          detail: "Email or password is incorrect.",
        });
        return;
      }
      await createSession(pool, res, config, user.id, "user");
      res.json({
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        displayName: user.display_name,
        givenName: user.given_name,
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/logout", async (req, res, next) => {
    try {
      await destroySession(pool, req, res, config);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return r;
}
