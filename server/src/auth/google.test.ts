import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  exchangeGoogleCode,
  googleAuthorizationUrl,
  parseTokenResponse,
  planGoogleAccount,
  statesMatch,
  verifyGoogleIdToken,
} from "./google.js";

function jwt(
  privateKey: KeyObject,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${h}.${p}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  return `${data}.${signer.sign(privateKey, "base64url")}`;
}

describe("google oauth helpers", () => {
  it("builds an OpenID authorization URL", () => {
    const url = googleAuthorizationUrl(
      {
        clientId: "cid.apps.googleusercontent.com",
        clientSecret: "secret",
        redirectUri: "http://localhost:5173/v1/auth/google/callback",
      },
      "a".repeat(64),
      "challenge-value",
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://accounts.google.com");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe("openid email profile");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(parsed.searchParams.get("client_id")).toBe(
      "cid.apps.googleusercontent.com",
    );
  });

  it("rejects mismatched OAuth state", () => {
    expect(statesMatch("a".repeat(64), "b".repeat(64))).toBe(false);
    expect(statesMatch("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(statesMatch("short", "short")).toBe(false);
  });

  it("reads id_token from a token response", () => {
    expect(
      parseTokenResponse({ id_token: "x".repeat(40), access_token: "nope" }),
    ).toBe("x".repeat(40));
    expect(() => parseTokenResponse({ access_token: "only" })).toThrow();
  });

  it("plans link, create, and conflict for Google accounts", () => {
    const row = {
      id: "u1",
      email: "a@example.com",
      google_sub: null as string | null,
      phone: null,
      role: "customer" as const,
      display_name: null as string | null,
      given_name: null as string | null,
    };
    expect(planGoogleAccount(undefined, undefined, "sub")).toBe("create");
    expect(planGoogleAccount(undefined, row, "sub")).toBe("link-email");
    expect(
      planGoogleAccount({ ...row, google_sub: "sub" }, undefined, "sub"),
    ).toBe("use-sub");
    expect(
      planGoogleAccount(undefined, { ...row, google_sub: "other" }, "sub"),
    ).toBe("conflict");
  });

  it("verifies a Google-shaped RS256 id token against JWKS", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(
      privateKey,
      { alg: "RS256", kid: "kid-1" },
      {
        iss: "https://accounts.google.com",
        aud: "cid",
        exp: now + 300,
        iat: now,
        sub: "google-sub-1",
        email: "Guest@Example.com",
        email_verified: true,
        name: "Walter Kamau",
        given_name: "Walter",
      },
    );
    const fetchImpl: typeof fetch = async (input) => {
      expect(String(input)).toContain("googleapis.com/oauth2/v3/certs");
      return new Response(
        JSON.stringify({ keys: [{ ...jwk, kid: "kid-1", kty: "RSA" }] }),
        { status: 200 },
      );
    };
    const claims = await verifyGoogleIdToken(token, "cid", fetchImpl);
    expect(claims).toEqual({
      sub: "google-sub-1",
      email: "guest@example.com",
      displayName: "Walter Kamau",
      givenName: "Walter",
    });
  });

  it("rejects an unverified email and a wrong audience", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ keys: [{ ...jwk, kid: "kid-1", kty: "RSA" }] }),
        { status: 200 },
      );
    const unverified = jwt(
      privateKey,
      { alg: "RS256", kid: "kid-1" },
      {
        iss: "https://accounts.google.com",
        aud: "cid",
        exp: now + 300,
        sub: "s",
        email: "a@example.com",
        email_verified: false,
      },
    );
    await expect(
      verifyGoogleIdToken(unverified, "cid", fetchImpl),
    ).rejects.toThrow();
    const wrongAud = jwt(
      privateKey,
      { alg: "RS256", kid: "kid-1" },
      {
        iss: "https://accounts.google.com",
        aud: "other",
        exp: now + 300,
        sub: "s",
        email: "a@example.com",
        email_verified: true,
      },
    );
    await expect(
      verifyGoogleIdToken(wrongAud, "cid", fetchImpl),
    ).rejects.toThrow();
  });

  it("accepts aud arrays and retries a dropped Google fetch once", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(
      privateKey,
      { alg: "RS256", kid: "kid-1" },
      {
        iss: "https://accounts.google.com",
        aud: ["cid", "other"],
        exp: now + 300,
        sub: "s2",
        email: "b@example.com",
        email_verified: "true",
      },
    );
    let jwksCalls = 0;
    const netFail = Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("connect"), { code: "ENETUNREACH" }),
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/certs")) {
        jwksCalls += 1;
        if (jwksCalls === 1) throw netFail;
        return new Response(
          JSON.stringify({ keys: [{ ...jwk, kid: "kid-1", kty: "RSA" }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${url}`);
    };
    await expect(verifyGoogleIdToken(token, "cid", fetchImpl)).resolves.toEqual({
      sub: "s2",
      email: "b@example.com",
      displayName: null,
      givenName: null,
    });
    expect(jwksCalls).toBe(2);

    let tokenCalls = 0;
    const tokenFetch: typeof fetch = async () => {
      tokenCalls += 1;
      if (tokenCalls === 1) throw netFail;
      return new Response(
        JSON.stringify({ id_token: "x".repeat(40) }),
        { status: 200 },
      );
    };
    await expect(
      exchangeGoogleCode(
        {
          clientId: "cid",
          clientSecret: "secret",
          redirectUri: "http://localhost:5173/v1/auth/google/callback",
        },
        "auth-code-value",
        tokenFetch,
        "v".repeat(43),
      ),
    ).resolves.toBe("x".repeat(40));
    expect(tokenCalls).toBe(2);
  });
});
