import type { Portal } from "../portal";
import { parsePortal } from "../portal";

const PENDING_KEY = "sherehe.oauth";
const ADMIN_CONFIRM_KEY = "sherehe.adminConfirming";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

export type GooglePending = {
  state: string;
  verifier: string;
  portal: Portal;
  /** Where the SPA should finish OAuth after Google's `/login` handoff. */
  resume: "login" | "admin";
};

export type GoogleClientConfig = {
  enabled: boolean;
  clientId?: string;
  redirectUri?: string;
};

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** RFC 7636 S256 challenge for a PKCE verifier. */
export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return b64url(new Uint8Array(digest));
}

export async function newPkce(): Promise<{
  state: string;
  verifier: string;
  challenge: string;
}> {
  const verifier = b64url(randomBytes(32));
  const state = Array.from(randomBytes(32), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { state, verifier, challenge: await s256Challenge(verifier) };
}

export function googleAuthorizationUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function storeGooglePending(pending: GooglePending): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* private mode */
  }
}

export function readGooglePending(): GooglePending | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "");
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as Record<string, unknown>;
    const portal = parsePortal(rec["portal"]);
    const state = rec["state"];
    const verifier = rec["verifier"];
    const resumeRaw = rec["resume"];
    const resume =
      resumeRaw === "admin" || resumeRaw === "login" ? resumeRaw : "login";
    if (
      !portal ||
      typeof state !== "string" ||
      state.length < 32 ||
      typeof verifier !== "string" ||
      verifier.length < 43
    ) {
      return null;
    }
    return { portal, state, verifier, resume };
  } catch {
    return null;
  }
}

export function clearGooglePending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode */
  }
}

/** True while admin Google callback is finishing (survives remounts / URL strip). */
export function setAdminConfirming(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(ADMIN_CONFIRM_KEY, "1");
    else sessionStorage.removeItem(ADMIN_CONFIRM_KEY);
  } catch {
    /* private mode */
  }
}

export function isAdminConfirming(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

/** True when the URL still carries an OAuth code handoff (boot /me must wait). */
export function hasOauthHandoffParams(
  search = typeof window !== "undefined" ? window.location.search : "",
): boolean {
  const params = new URLSearchParams(search);
  return Boolean(params.get("code") && params.get("state"));
}

export function pendingMatches(pending: GooglePending, state: string): boolean {
  return pending.state.length === state.length && pending.state === state;
}

/** Full-page navigation to Google. Isolated so tests can stub it. */
export function leaveForGoogle(url: string): void {
  window.location.assign(url);
}
