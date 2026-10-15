import { describe, expect, it } from "vitest";
import { isStaffEmail } from "./staffEmail.js";

const allow = ["one.admin@example.com", "two.admin@example.com"];

describe("isStaffEmail", () => {
  it("matches either configured address, ignoring case and surrounding space", () => {
    expect(isStaffEmail("one.admin@example.com", allow)).toBe(true);
    expect(isStaffEmail("  TWO.ADMIN@example.com ", allow)).toBe(true);
  });

  it("rejects every other address and an empty allowlist", () => {
    expect(isStaffEmail("other@example.com", allow)).toBe(false);
    expect(isStaffEmail("one.admin@example.com", [])).toBe(false);
    expect(isStaffEmail("", allow)).toBe(false);
  });
});
