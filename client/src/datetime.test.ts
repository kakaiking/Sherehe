import { describe, expect, it } from "vitest";
import {
  eventDayParts,
  flashStatus,
  formatEventDay,
  formatEventPlaceCompact,
  formatPurchaseWhen,
  formatScheduleWhen,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
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

describe("datetime-local Nairobi helpers", () => {
  it("formats ISO as a Nairobi datetime-local value", () => {
    expect(toDatetimeLocalValue("2026-09-18T08:50:00.000Z")).toBe(
      "2026-09-18T11:50",
    );
  });

  it("parses a Nairobi datetime-local value back to ISO UTC", () => {
    expect(fromDatetimeLocalValue("2026-09-18T11:50")).toBe(
      "2026-09-18T08:50:00.000Z",
    );
  });

  it("formats a compact schedule line", () => {
    const text = formatScheduleWhen("2026-09-18T08:50:00.000Z");
    expect(text).toMatch(/18/);
    expect(text).toMatch(/Sep/i);
    expect(text).toMatch(/11:50/);
  });
});

describe("flashStatus", () => {
  const now = new Date("2026-09-24T10:00:00.000Z");

  it("reports off when disabled", () => {
    expect(flashStatus(false, null, null, now)).toBe("off");
  });

  it("reports scheduled before start", () => {
    expect(
      flashStatus(
        true,
        "2026-09-24T12:00:00.000Z",
        "2026-09-25T00:00:00.000Z",
        now,
      ),
    ).toBe("scheduled");
  });

  it("reports live inside the window", () => {
    expect(
      flashStatus(
        true,
        "2026-09-24T09:00:00.000Z",
        "2026-09-25T00:00:00.000Z",
        now,
      ),
    ).toBe("live");
  });

  it("reports live when today is a selected flash day", () => {
    expect(
      flashStatus(true, null, null, now, ["2026-09-24"]),
    ).toBe("live");
    expect(
      flashStatus(true, null, null, now, ["2026-09-25"]),
    ).toBe("scheduled");
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
