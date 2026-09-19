import { describe, expect, it } from "vitest";
import {
  googleLoginMessage,
  googlePostErrorCode,
  googleSessionErrorCode,
  parseGoogleLoginError,
} from "./googleLoginError";

describe("parseGoogleLoginError", () => {
  it("accepts only allowlisted codes", () => {
    expect(parseGoogleLoginError("google")).toBe("google");
    expect(parseGoogleLoginError("google_off")).toBe("google_off");
    expect(parseGoogleLoginError("google_denied")).toBe("google_denied");
    expect(parseGoogleLoginError("google_state")).toBe("google_state");
    expect(parseGoogleLoginError("google_conflict")).toBe("google_conflict");
    expect(parseGoogleLoginError("google_network")).toBe("google_network");
    expect(parseGoogleLoginError("google_session")).toBe("google_session");
    expect(parseGoogleLoginError("google_portal")).toBe("google_portal");
  });

  it("ignores unknown or injected query values", () => {
    expect(parseGoogleLoginError(null)).toBeNull();
    expect(parseGoogleLoginError("")).toBeNull();
    expect(parseGoogleLoginError("access_denied")).toBeNull();
    expect(parseGoogleLoginError("<script>")).toBeNull();
    expect(parseGoogleLoginError("google_off;alert(1)")).toBeNull();
  });
});

describe("googleLoginMessage", () => {
  it("never echoes the raw code", () => {
    expect(googleLoginMessage("google_network")).not.toContain("google_network");
    expect(googleLoginMessage("google_off")).toMatch(/not set up/i);
    expect(googleLoginMessage("google_denied")).toMatch(/cancelled/i);
    expect(googleLoginMessage("google_state")).toMatch(/expired/i);
    expect(googleLoginMessage("google_conflict")).toMatch(/another account/i);
    expect(googleLoginMessage("google_network")).toMatch(/VPN|network/i);
    expect(googleLoginMessage("google_session")).toMatch(/cookies/i);
    expect(googleLoginMessage("google_portal")).toMatch(/different portal/i);
    expect(googleLoginMessage("google")).toMatch(/did not complete/i);
  });
});

describe("googleSessionErrorCode", () => {
  it("treats 401 after OAuth as a dropped session cookie", () => {
    expect(googleSessionErrorCode({ status: 401, detail: "Sign in" })).toBe(
      "google_session",
    );
  });

  it("treats other API statuses as generic and fetch throws as network", () => {
    expect(googleSessionErrorCode({ status: 500, detail: "fail" })).toBe(
      "google",
    );
    expect(googleSessionErrorCode(new TypeError("Failed to fetch"))).toBe(
      "google_network",
    );
  });
});

describe("googlePostErrorCode", () => {
  it("prefers an allowlisted body code over status", () => {
    expect(
      googlePostErrorCode({ status: 400, detail: "x", code: "google_state" }),
    ).toBe("google_state");
    expect(googlePostErrorCode({ status: 409, detail: "x" })).toBe(
      "google_conflict",
    );
    expect(googlePostErrorCode({ status: 400, detail: "x", code: "<script>" })).toBe(
      "google",
    );
  });
});
