import { describe, expect, it } from "vitest";
import { isStaffEmail } from "./staffEmail.js";

describe("isStaffEmail", () => {
  it("matches case-insensitively when STAFF_EMAIL is set", () => {
    expect(isStaffEmail("kakaiphil@gmail.com", "kakaiphil@gmail.com")).toBe(true);
    expect(isStaffEmail("Kakaiphil@Gmail.com", "kakaiphil@gmail.com")).toBe(true);
  });

  it("rejects other emails", () => {
    expect(isStaffEmail("other@gmail.com", "kakaiphil@gmail.com")).toBe(false);
    expect(isStaffEmail("kakaiphil@gmail.com", undefined)).toBe(false);
  });
});
