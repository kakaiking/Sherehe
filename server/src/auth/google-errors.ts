/** Codes safe to put on `/login?error=`. Never echo Google's `error` or `error_description`. */
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

/**
 * Maps Google's OAuth `error` query to an allowlisted app code.
 * `access_denied` is the user cancelling; everything else stays generic.
 */
export function googleProviderErrorCode(providerError: string): GoogleLoginError {
  if (providerError === "access_denied") return "google_denied";
  return "google";
}

/**
 * Maps a thrown callback failure to an allowlisted code.
 * `google_fetch:*` is our wrapper around outbound Google HTTP failures.
 */
export function googleCallbackErrorCode(err: unknown): GoogleLoginError {
  const msg = err instanceof Error ? err.message : "";
  if (msg.startsWith("google_fetch:")) return "google_network";
  return "google";
}

/**
 * Turns Google's GET callback into a same-origin `/login` handoff.
 * The SPA finishes with PKCE (sessionStorage), so we never need the
 * `sherehe_oauth` cookie that bounce-tracking strips on the 302 to Google.
 */
export function googleCallbackHandoff(
  query: Record<string, unknown>,
  clientOrigin: string,
): string {
  const login = new URL("/login", clientOrigin);
  if (typeof query["error"] === "string") {
    login.searchParams.set("error", googleProviderErrorCode(query["error"]));
    return login.toString();
  }
  const code = typeof query["code"] === "string" ? query["code"] : "";
  const state = typeof query["state"] === "string" ? query["state"] : "";
  if (
    code.length < 8 ||
    code.length > 8192 ||
    state.length < 32 ||
    state.length > 256
  ) {
    login.searchParams.set("error", "google_state");
    return login.toString();
  }
  login.searchParams.set("code", code);
  login.searchParams.set("state", state);
  return login.toString();
}
