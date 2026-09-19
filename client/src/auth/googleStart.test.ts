import { describe, expect, it } from "vitest";
import {
  clearGooglePending,
  googleAuthorizationUrl,
  pendingMatches,
  readGooglePending,
  s256Challenge,
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
      portal: "vendor",
    });
    const pending = readGooglePending();
    expect(pending?.portal).toBe("vendor");
    expect(pendingMatches(pending!, "s".repeat(64))).toBe(true);
    expect(pendingMatches(pending!, "t".repeat(64))).toBe(false);
    clearGooglePending();
    expect(readGooglePending()).toBeNull();
  });
});
