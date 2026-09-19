import { describe, expect, it } from "vitest";
import { signTicketPublicId, verifyTicketSignature } from "./hmac.js";

describe("ticket hmac", () => {
  it("accepts a matching signature and rejects a mutated id", () => {
    const sig = signTicketPublicId("abc", "test-secret-value-1");
    expect(verifyTicketSignature("abc", sig, "test-secret-value-1")).toBe(true);
    expect(verifyTicketSignature("abd", sig, "test-secret-value-1")).toBe(false);
  });
});
