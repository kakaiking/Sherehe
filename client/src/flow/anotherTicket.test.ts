import { describe, expect, it } from "vitest";
import { needsAnotherTicketConfirm } from "./anotherTicket";

describe("needsAnotherTicketConfirm", () => {
  it("asks only when a stub was already downloaded", () => {
    expect(needsAnotherTicketConfirm(true, false)).toBe(true);
    expect(needsAnotherTicketConfirm(false, false)).toBe(false);
    expect(needsAnotherTicketConfirm(true, true)).toBe(false);
  });
});
