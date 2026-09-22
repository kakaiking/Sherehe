import { describe, expect, it } from "vitest";
import {
  flashDateMax,
  flashDayBounds,
  flashWindowFromDates,
  isDateStr,
  isFlashDateAllowed,
  nairobiDateStr,
  normalizeFlashDates,
} from "./flashDates.js";

describe("flashDates", () => {
  it("formats a Nairobi calendar date", () => {
    expect(nairobiDateStr(new Date("2026-09-22T08:00:00.000Z"))).toBe(
      "2026-09-22",
    );
  });

  it("validates YYYY-MM-DD strings", () => {
    expect(isDateStr("2026-09-22")).toBe(true);
    expect(isDateStr("2026-13-01")).toBe(false);
    expect(isDateStr("22-09-2026")).toBe(false);
  });

  it("normalizes and sorts unique dates", () => {
    expect(
      normalizeFlashDates(["2026-09-25", "2026-09-22", "2026-09-22", "nope"]),
    ).toEqual(["2026-09-22", "2026-09-25"]);
  });

  it("builds day bounds in Nairobi", () => {
    const { start, end } = flashDayBounds("2026-09-22");
    expect(start.toISOString()).toBe("2026-09-21T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-22T20:59:59.999Z");
  });

  it("derives the envelope from selected days", () => {
    const window = flashWindowFromDates(["2026-09-22", "2026-09-25"]);
    expect(window.startsAt?.toISOString()).toBe("2026-09-21T21:00:00.000Z");
    expect(window.endsAt?.toISOString()).toBe("2026-09-25T20:59:59.999Z");
  });

  it("allows today through the event night only", () => {
    const now = new Date("2026-09-22T12:00:00+03:00");
    expect(flashDateMax()).toBe("2026-11-28");
    expect(isFlashDateAllowed("2026-09-21", now)).toBe(false);
    expect(isFlashDateAllowed("2026-09-22", now)).toBe(true);
    expect(isFlashDateAllowed("2026-11-28", now)).toBe(true);
    expect(isFlashDateAllowed("2026-11-29", now)).toBe(false);
  });
});
