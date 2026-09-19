import { describe, expect, it } from "vitest";
import { EVENT_STARTS_AT, EVENT_VENUE } from "../eventFacts.js";
import {
  formatPdfEventDay,
  venueHall,
  venueLocality,
} from "./eventLine.js";

describe("eventLine", () => {
  it("formats Saturday 28 Nov 2026 in Nairobi", () => {
    const text = formatPdfEventDay(EVENT_STARTS_AT);
    expect(text).toMatch(/28/);
    expect(text).toMatch(/Nov/i);
    expect(text).toMatch(/2026/);
  });

  it("splits Fused Lens from Kirigiti", () => {
    expect(venueHall(EVENT_VENUE)).toBe("Fused Lens Studios");
    expect(venueLocality(EVENT_VENUE)).toBe("Kirigiti, Kiambu");
  });
});
