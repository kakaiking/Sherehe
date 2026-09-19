import {
  createPublicKey,
  createVerify,
  timingSafeEqual,
} from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { z } from "zod";
import { sanitizeDisplayName, sanitizeGivenName } from "../tickets/holder.js";

// Node 18+ / some VPNs fail IPv6 to Google first; prefer A records.
setDefaultResultOrder("ipv4first");

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const SKEW_MS = 60_000;
const TOKEN_MAX = 8192;

export type GoogleClaims = {
  sub: string;
  email: string;
  displayName: string | null;
  givenName: string | null;
};

const TokenBody = z.object({
  id_token: z.string().min(20).max(TOKEN_MAX),
});

const JwtHeader = z.object({
  alg: z.literal("RS256"),
  kid: z.string().min(1).max(128),
});

const JwtPayload = z.object({
  iss: z.string(),
  aud: z.union([
    z.string().min(1).max(255),
    z.array(z.string().min(1).max(255)).min(1).max(4),
  ]),
  exp: z.number().int(),
  iat: z.number().int().optional(),
  nbf: z.number().int().optional(),
  sub: z.string().min(1).max(255),
  email: z.string().email().max(255),
  email_verified: z.union([z.literal(true), z.literal("true")]),
  name: z.string().max(200).optional(),
  given_name: z.string().max(200).optional(),
});

const JwksBody = z.object({
  keys: z.array(z.record(z.string(), z.unknown())).max(32),
});

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function statesMatch(left: string, right: string): boolean {
  if (left.length !== right.length || left.length < 32) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function googleAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
  challenge: string,
): string {
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function parseTokenResponse(body: unknown): string {
  const parsed = TokenBody.safeParse(body);
  if (!parsed.success) {
    throw new Error("token_response");
  }
  return parsed.data.id_token;
}

function b64urlJson(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
}

function networkCode(err: unknown): string {
  let current: unknown = err;
  for (let i = 0; i < 4; i += 1) {
    if (!current || typeof current !== "object") break;
    if ("code" in current && typeof current.code === "string" && current.code) {
      return current.code.slice(0, 40);
    }
    current = "cause" in current ? current.cause : undefined;
  }
  if (err instanceof Error && err.message) return err.message.slice(0, 40);
  return "unknown";
}

async function fetchGoogle(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchImpl(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(10_000),
      });
    } catch (err) {
      last = err;
      if (attempt < 2) {
        await new Promise((resolve) => {
          setTimeout(resolve, 150 * (attempt + 1));
        });
      }
    }
  }
  throw new Error(`google_fetch:${networkCode(last)}`);
}

export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
  fetchImpl: typeof fetch,
  nowMs: number = Date.now(),
): Promise<GoogleClaims> {
  if (idToken.length > TOKEN_MAX || idToken.split(".").length !== 3) {
    throw new Error("id_token");
  }
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new Error("id_token");
  const header = JwtHeader.parse(b64urlJson(h));
  const jwksRes = await fetchGoogle(GOOGLE_JWKS, {}, fetchImpl);
  if (!jwksRes.ok) throw new Error("jwks");
  const jwks = JwksBody.parse(await jwksRes.json());
  const jwk = jwks.keys.find((k) => k["kid"] === header.kid);
  if (
    !jwk ||
    jwk["kty"] !== "RSA" ||
    typeof jwk["n"] !== "string" ||
    typeof jwk["e"] !== "string"
  ) {
    throw new Error("kid");
  }
  const key = createPublicKey({
    format: "jwk",
    key: { kty: "RSA", n: jwk["n"], e: jwk["e"] },
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  if (!verifier.verify(key, s, "base64url")) {
    throw new Error("sig");
  }
  const payload = JwtPayload.parse(b64urlJson(p));
  if (!ISSUERS.has(payload.iss)) throw new Error("iss");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) throw new Error("aud");
  if (payload.exp * 1000 < nowMs - SKEW_MS) throw new Error("exp");
  if (payload.nbf !== undefined && payload.nbf * 1000 > nowMs + SKEW_MS) {
    throw new Error("nbf");
  }
  const displayName = sanitizeDisplayName(payload.name ?? null);
  const givenName = sanitizeGivenName(payload.given_name ?? null, displayName);
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    displayName,
    givenName,
  };
}

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
  fetchImpl: typeof fetch,
  verifier: string,
): Promise<string> {
  if (code.length < 8 || code.length > 8192) {
    throw new Error("code");
  }
  if (!PKCE_VERIFIER.test(verifier)) {
    throw new Error("verifier");
  }
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const res = await fetchGoogle(
    GOOGLE_TOKEN,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
    fetchImpl,
  );
  if (!res.ok) throw new Error("token_http");
  return parseTokenResponse(await res.json());
}

export type GoogleUserRow = {
  id: string;
  email: string;
  google_sub: string | null;
  phone: string | null;
  role: "customer" | "staff" | "partner" | "vendor";
  display_name: string | null;
  given_name: string | null;
};

export function planGoogleAccount(
  bySub: GoogleUserRow | undefined,
  byEmail: GoogleUserRow | undefined,
  sub: string,
): "use-sub" | "link-email" | "create" | "conflict" {
  if (bySub) return "use-sub";
  if (byEmail) {
    if (byEmail.google_sub && byEmail.google_sub !== sub) return "conflict";
    return "link-email";
  }
  return "create";
}
