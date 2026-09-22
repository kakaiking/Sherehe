import { api } from "../api";
import { saveContinue } from "../flow/continue";
import { storePortal, type Portal } from "../portal";
import {
  googleAuthorizationUrl,
  leaveForGoogle,
  newPkce,
  setAdminConfirming,
  storeGooglePending,
  type GoogleClientConfig,
} from "./googleStart";

/**
 * Starts the Google PKCE redirect for a portal gate.
 * Optional `continuePath` is restored after the `/login` handoff finishes.
 */
export async function beginGoogleSignIn(opts: {
  portal: Portal;
  resume: "login" | "admin";
  continuePath?: string;
}): Promise<void> {
  const cfg = await api<GoogleClientConfig>("/v1/auth/google");
  if (!cfg.enabled || !cfg.clientId || !cfg.redirectUri) {
    throw Object.assign(new Error("Google sign-in is not set up on this server."), {
      status: 503,
      detail: "Google sign-in is not set up on this server.",
      code: "google_off",
    });
  }
  const pkce = await newPkce();
  if (opts.resume !== "admin") setAdminConfirming(false);
  storePortal(opts.portal);
  if (opts.continuePath) saveContinue(opts.continuePath);
  storeGooglePending({
    state: pkce.state,
    verifier: pkce.verifier,
    portal: opts.portal,
    resume: opts.resume,
  });
  leaveForGoogle(
    googleAuthorizationUrl({
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      state: pkce.state,
      challenge: pkce.challenge,
    }),
  );
}
