import { describe, expect, it } from "vitest";
import { passPublicView, type TicketPassInfo } from "./passLookup.js";

function basePass(
  overrides: Partial<TicketPassInfo> = {},
): TicketPassInfo {
  return {
    id: "tid",
    publicId: "a".repeat(32),
    status: "issued",
    code: "early_bird",
    label: "Early Bird",
    holderName: "Amina Otieno",
    usedAt: null,
    eventName: "Sherehe",
    venue: "Fused Lens",
    startsAt: "2026-11-28T13:00:00.000Z",
    ...overrides,
  };
}

describe("passPublicView", () => {
  it("tells guests a ready pass is for the gate only", () => {
    const view = passPublicView(basePass());
    expect(view.readyForGate).toBe(true);
    expect(view.headline).toBe("Valid pass");
    expect(view.detail).toMatch(/does not mark you as entered/i);
  });

  it("explains an already-used pass without admitting again", () => {
    const view = passPublicView(
      basePass({
        status: "used",
        usedAt: "2026-11-28T18:00:00.000Z",
      }),
    );
    expect(view.readyForGate).toBe(false);
    expect(view.headline).toBe("Already checked in");
  });
});
