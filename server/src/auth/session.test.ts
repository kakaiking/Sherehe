import { describe, expect, it } from "vitest";
import {
  LEGACY_SESSION_COOKIE,
  resolveSessionPortal,
  sessionCookieName,
} from "./session.js";

describe("sessionCookieName", () => {
  it("names a cookie per session kind", () => {
    expect(sessionCookieName("user")).toBe("sherehe_sid_user");
    expect(sessionCookieName("admin")).toBe("sherehe_sid_admin");
  });
});

describe("resolveSessionPortal", () => {
  it("prefers a valid X-Sherehe-Portal header including admin", () => {
    expect(
      resolveSessionPortal(
        { sherehe_sid_user: "u", sherehe_sid_admin: "a" },
        "admin",
      ),
    ).toBe("admin");
    expect(
      resolveSessionPortal({ sherehe_sid_user: "u" }, "user"),
    ).toBe("user");
  });

  it("ignores an invalid or retired portal header", () => {
    expect(
      resolveSessionPortal({ sherehe_sid_user: "u" }, "staff"),
    ).toBe("user");
    expect(
      resolveSessionPortal({ sherehe_sid_user: "u" }, "partner"),
    ).toBe("user");
    expect(
      resolveSessionPortal({ sherehe_sid_user: "u" }, "vendor"),
    ).toBe("user");
  });

  it("uses the sole present cookie when the header is missing", () => {
    expect(resolveSessionPortal({ sherehe_sid_admin: "a" }, undefined)).toBe(
      "admin",
    );
    expect(resolveSessionPortal({ sherehe_sid_user: "u" }, undefined)).toBe(
      "user",
    );
  });

  it("prefers user when both guest and admin cookies are present", () => {
    expect(
      resolveSessionPortal(
        {
          sherehe_sid_user: "u",
          sherehe_sid_admin: "a",
        },
        undefined,
      ),
    ).toBe("user");
  });

  it("defaults to user when nothing is present", () => {
    expect(resolveSessionPortal({}, undefined)).toBe("user");
    expect(LEGACY_SESSION_COOKIE).toBe("sherehe_sid");
  });
});
