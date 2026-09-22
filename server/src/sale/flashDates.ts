import { EVENT_STARTS_AT } from "../eventFacts.js";

const NAIROBI = "Africa/Nairobi";
const NAIROBI_OFFSET = "+03:00";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date `YYYY-MM-DD` in Africa/Nairobi for an instant. */
export function nairobiDateStr(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NAIROBI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function isDateStr(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, day] = value.split("-").map(Number);
  if (y === undefined || m === undefined || day === undefined) return false;
  const probe = new Date(`${value}T12:00:00${NAIROBI_OFFSET}`);
  if (Number.isNaN(probe.getTime())) return false;
  return nairobiDateStr(probe) === value;
}

/** Last selectable flash day — the event night (Nairobi calendar). */
export function flashDateMax(): string {
  return nairobiDateStr(EVENT_STARTS_AT);
}

/** Today…event night inclusive. Past days and post-event days are out. */
export function isFlashDateAllowed(
  dateStr: string,
  now: Date = new Date(),
): boolean {
  if (!isDateStr(dateStr)) return false;
  const today = nairobiDateStr(now);
  return dateStr >= today && dateStr <= flashDateMax();
}

/** Sort unique valid YYYY-MM-DD strings. */
export function normalizeFlashDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!isDateStr(trimmed)) continue;
    out.add(trimmed);
  }
  return [...out].sort();
}

/** Nairobi midnight → end-of-day for a calendar date. */
export function flashDayBounds(dateStr: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateStr}T00:00:00${NAIROBI_OFFSET}`),
    end: new Date(`${dateStr}T23:59:59.999${NAIROBI_OFFSET}`),
  };
}

export function flashWindowFromDates(dates: string[]): {
  startsAt: Date | null;
  endsAt: Date | null;
} {
  if (dates.length === 0) return { startsAt: null, endsAt: null };
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  return {
    startsAt: flashDayBounds(first).start,
    endsAt: flashDayBounds(last).end,
  };
}
