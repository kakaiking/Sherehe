import { describe, expect, it } from "vitest";
import { ticketLabel } from "./label.js";

describe("ticketLabel", () => {
  it("uses guest-facing names, not snake_case codes", () => {
    expect(ticketLabel("early_bird")).toBe("Early Bird");
    expect(ticketLabel("viip")).toBe("VIIP");
  });
});
