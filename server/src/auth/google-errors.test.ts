import { describe, expect, it } from "vitest";
import {
  googleCallbackErrorCode,
  googleCallbackHandoff,
  googleProviderErrorCode,
} from "./google-errors.js";

describe("googleProviderErrorCode", () => {
  it("maps Google access_denied to a cancelled sign-in", () => {
    expect(googleProviderErrorCode("access_denied")).toBe("google_denied");
  });

  it("does not pass through other provider strings", () => {
    expect(googleProviderErrorCode("invalid_request")).toBe("google");
    expect(googleProviderErrorCode("https://evil.example")).toBe("google");
  });
});

describe("googleCallbackErrorCode", () => {
  it("maps Google fetch failures to the network code", () => {
    expect(
      googleCallbackErrorCode(new Error("google_fetch:fetch failed")),
    ).toBe("google_network");
    expect(googleCallbackErrorCode(new Error("google_fetch:ENETUNREACH"))).toBe(
      "google_network",
    );
  });

  it("maps token and JWT failures to the generic code", () => {
    expect(googleCallbackErrorCode(new Error("token_http"))).toBe("google");
    expect(googleCallbackErrorCode(new Error("id_token"))).toBe("google");
    expect(googleCallbackErrorCode("nope")).toBe("google");
  });
});

describe("googleCallbackHandoff", () => {
  const origin = "http://localhost:5173";

  it("maps provider cancel without echoing Google's string", () => {
    const url = new URL(
      googleCallbackHandoff({ error: "access_denied" }, origin),
    );
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("google_denied");
    expect(url.searchParams.get("error_description")).toBeNull();
  });

  it("forwards a well-formed code to the SPA", () => {
    const url = new URL(
      googleCallbackHandoff(
        { code: "auth-code-value", state: "s".repeat(64) },
        origin,
      ),
    );
    expect(url.searchParams.get("code")).toBe("auth-code-value");
    expect(url.searchParams.get("state")).toBe("s".repeat(64));
  });

  it("rejects a missing state as google_state", () => {
    const url = new URL(
      googleCallbackHandoff({ code: "auth-code-value" }, origin),
    );
    expect(url.searchParams.get("error")).toBe("google_state");
    expect(url.searchParams.get("code")).toBeNull();
  });
});
