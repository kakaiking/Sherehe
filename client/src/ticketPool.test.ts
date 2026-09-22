import { describe, expect, it } from "vitest";
import {
  parseCapacityDraft,
  poolDeltaCopy,
  TICKET_CAPACITY_POOL,
} from "./ticketPool";

describe("ticketPool", () => {
  it("reports short and over against the fixed pool", () => {
    expect(poolDeltaCopy(290)).toBe("10 short.");
    expect(poolDeltaCopy(310)).toBe("10 over.");
    expect(poolDeltaCopy(TICKET_CAPACITY_POOL)).toBe("Pool balanced.");
  });

  it("parses whole non-negative capacities", () => {
    expect(parseCapacityDraft("40")).toBe(40);
    expect(parseCapacityDraft(" 0 ")).toBe(0);
    expect(parseCapacityDraft("")).toBeNull();
    expect(parseCapacityDraft("12.5")).toBeNull();
    expect(parseCapacityDraft("-1")).toBeNull();
  });
});
