import { describe, expect, it } from "vitest";
import { normalizeKenyanPhone, stkPhone } from "./phone.js";

describe("normalizeKenyanPhone", () => {
  it("accepts 07, 254, and +254 forms", () => {
    expect(normalizeKenyanPhone("0712345678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254712345678")).toBe("254712345678");
    expect(normalizeKenyanPhone("254712345678")).toBe("254712345678");
    expect(normalizeKenyanPhone("0112345678")).toBe("254112345678");
  });

  it("rejects short or foreign numbers", () => {
    expect(normalizeKenyanPhone("12345")).toBeNull();
    expect(normalizeKenyanPhone("+14155551234")).toBeNull();
  });
});

describe("stkPhone", () => {
  it("returns null when the account has no number", () => {
    expect(stkPhone(null)).toBeNull();
    expect(stkPhone(undefined)).toBeNull();
    expect(stkPhone("0712345678")).toBe("254712345678");
  });
});
