import { describe, expect, it } from "vitest";
import { EVENT_STARTS_AT, EVENT_VENUE } from "../eventFacts.js";
import {
  formatPdfEventDay,
  venueHall,
  venueLocality,
} from "./eventLine.js";

describe("eventLine", () => {
  it("formats Sunday 13 Dec 2026 in Nairobi", () => {
    const text = formatPdfEventDay(EVENT_STARTS_AT);
    expect(text).toMatch(/13/);
    expect(text).toMatch(/Dec/i);
    expect(text).toMatch(/2026/);
  });

  it("splits Fused Lens from Kirigiti", () => {
    expect(venueHall(EVENT_VENUE)).toBe("Fused Lens Studios");
    expect(venueLocality(EVENT_VENUE)).toBe("Kirigiti, Kiambu");
  });
});
