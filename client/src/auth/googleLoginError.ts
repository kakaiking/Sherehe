/** Allowlisted `?error=` values from `/v1/auth/google` redirects. Unknown query values are ignored. */
export const GOOGLE_LOGIN_ERRORS = [
  "google",
  "google_off",
  "google_denied",
  "google_state",
  "google_conflict",
  "google_network",
  "google_session",
  "google_portal",
] as const;

export type GoogleLoginError = (typeof GOOGLE_LOGIN_ERRORS)[number];

const MESSAGES: Record<GoogleLoginError, string> = {
  google: "Google sign-in did not complete. Try again.",
  google_off: "Google sign-in is not set up on this server.",
  google_denied: "Google sign-in was cancelled.",
  google_state: "That sign-in expired. Try Continue with Google again.",
  google_conflict: "That Google email is already tied to another account.",
  google_network:
    "Could not reach Google. Check the network or pause the VPN, then try again.",
  google_session:
    "Signed in, but this browser did not keep the session. Allow cookies and try again.",
  google_portal:
    "That Google account already belongs to a different portal. Pick the gate you signed up on.",
};

/**
 * Parses a login `error` query value. Only allowlisted codes are returned so
 * the page never renders attacker-controlled query text.
 */
export function parseGoogleLoginError(
  raw: string | null,
): GoogleLoginError | null {
  if (!raw) return null;
  return (GOOGLE_LOGIN_ERRORS as readonly string[]).includes(raw)
    ? (raw as GoogleLoginError)
    : null;
}

/** User-facing copy for an allowlisted Google sign-in failure. */
export function googleLoginMessage(code: GoogleLoginError): string {
  return MESSAGES[code];
}

/**
 * Maps a failed `/v1/auth/me` after `?from=google` to a safe code.
 * `ApiError` has a numeric status; a thrown `TypeError` is a network miss.
 */
export function googleSessionErrorCode(err: unknown): GoogleLoginError {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number"
  ) {
    if (err.status === 401) return "google_session";
    return "google";
  }
  return "google_network";
}

/** Maps a failed POST `/v1/auth/google/callback` to an allowlisted code. */
export function googlePostErrorCode(err: unknown): GoogleLoginError {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof err.code === "string"
  ) {
    const parsed = parseGoogleLoginError(err.code);
    if (parsed) return parsed;
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number"
  ) {
    if (err.status === 409) return "google_conflict";
    if (err.status === 403) return "google_portal";
    if (err.status === 502) return "google_network";
    if (err.status === 503) return "google_off";
    return "google";
  }
  return "google_network";
}
