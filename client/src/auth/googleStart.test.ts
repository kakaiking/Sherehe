import { describe, expect, it } from "vitest";
import {
  clearGooglePending,
  googleAuthorizationUrl,
  hasOauthHandoffParams,
  isAdminConfirming,
  pendingMatches,
  readGooglePending,
  s256Challenge,
  setAdminConfirming,
  storeGooglePending,
} from "./googleStart";

describe("s256Challenge", () => {
  it("matches the RFC 7636 appendix B vector", async () => {
    await expect(
      s256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("googleAuthorizationUrl", () => {
  it("includes PKCE S256 on the Google authorize URL", () => {
    const url = new URL(
      googleAuthorizationUrl({
        clientId: "cid.apps.googleusercontent.com",
        redirectUri: "http://localhost:5173/v1/auth/google/callback",
        state: "a".repeat(64),
        challenge: "challenge-value",
      }),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("state")).toBe("a".repeat(64));
  });
});

describe("google pending sessionStorage", () => {
  it("round-trips a pending PKCE start and rejects a foreign state", () => {
    storeGooglePending({
      state: "s".repeat(64),
      verifier: "v".repeat(43),
      portal: "user",
      resume: "login",
    });
    const pending = readGooglePending();
    expect(pending?.portal).toBe("user");
    expect(pending?.resume).toBe("login");
    expect(pendingMatches(pending!, "s".repeat(64))).toBe(true);
    expect(pendingMatches(pending!, "t".repeat(64))).toBe(false);
    clearGooglePending();
    expect(readGooglePending()).toBeNull();
  });

  it("round-trips an admin PKCE start", () => {
    storeGooglePending({
      state: "b".repeat(64),
      verifier: "w".repeat(43),
      portal: "admin",
      resume: "admin",
    });
    expect(readGooglePending()?.portal).toBe("admin");
    expect(readGooglePending()?.resume).toBe("admin");
    clearGooglePending();
  });

  it("defaults resume to login when older pending JSON omits it", () => {
    sessionStorage.setItem(
      "sherehe.oauth",
      JSON.stringify({
        state: "s".repeat(64),
        verifier: "v".repeat(43),
        portal: "user",
      }),
    );
    expect(readGooglePending()?.resume).toBe("login");
  });

  it("tracks admin confirming across remounts", () => {
    expect(isAdminConfirming()).toBe(false);
    setAdminConfirming(true);
    expect(isAdminConfirming()).toBe(true);
    setAdminConfirming(false);
    expect(isAdminConfirming()).toBe(false);
  });

  it("detects OAuth handoff query params", () => {
    expect(hasOauthHandoffParams("?code=abc&state=xyz")).toBe(true);
    expect(hasOauthHandoffParams("?error=google")).toBe(false);
  });
});
