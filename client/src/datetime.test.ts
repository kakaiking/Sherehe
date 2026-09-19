import { describe, expect, it } from "vitest";
import {
  eventDayParts,
  formatEventDay,
  formatEventPlaceCompact,
  formatPurchaseWhen,
  venueLines,
} from "./datetime";

describe("formatPurchaseWhen", () => {
  it("renders a Nairobi date and time", () => {
    const text = formatPurchaseWhen("2026-09-18T08:50:00.000Z");
    expect(text).toMatch(/18/);
    expect(text).toMatch(/Sep/i);
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/11:50/);
  });
});

describe("event night", () => {
  const starts = "2026-11-28T13:00:00.000Z";

  it("renders the Nairobi calendar date without a clock", () => {
    const text = formatEventDay(starts);
    expect(text).toMatch(/28/);
    expect(text).toMatch(/Nov/i);
    expect(text).toMatch(/2026/);
    expect(text).not.toMatch(/\d:\d{2}/);
  });

  it("splits the studio from Kirigiti", () => {
    const lines = venueLines("Fused Lens Studios, Kirigiti, Kiambu");
    expect(lines.hall).toBe("Fused Lens Studios");
    expect(lines.locality).toBe("Kirigiti, Kiambu");
    expect(formatEventPlaceCompact("Fused Lens Studios, Kirigiti, Kiambu")).toBe(
      "Kirigiti",
    );
  });

  it("exposes calendar block parts", () => {
    const parts = eventDayParts(starts);
    expect(parts?.day).toBe("28");
    expect(parts?.year).toBe("2026");
    expect(parts?.month).toMatch(/Nov/i);
  });
});
