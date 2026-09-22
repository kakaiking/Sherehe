const NAIROBI = "Africa/Nairobi";
/** Nairobi observes a fixed UTC+3 offset (no DST). */
const NAIROBI_OFFSET = "+03:00";

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

/** Purchase time on the account history list (Nairobi wall clock). */
export function formatPurchaseWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Compact Nairobi date+time for admin status lines. */
export function formatScheduleWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * ISO → `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">` in Nairobi.
 * When `iso` is null/invalid, uses `fallback` (default: now).
 */
export function toDatetimeLocalValue(
  iso: string | null | undefined,
  fallback: Date = new Date(),
): string {
  const d = iso ? new Date(iso) : fallback;
  const source = Number.isNaN(d.getTime()) ? fallback : d;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NAIROBI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(source);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  let hour = pick("hour");
  const minute = pick("minute");
  if (hour === "24") hour = "00";
  if (!year || !month || !day || !hour || !minute) return "";
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * `datetime-local` value (Nairobi wall clock) → ISO UTC string.
 * Returns null when the value is empty or unparseable.
 */
export function fromDatetimeLocalValue(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed;
  const d = new Date(`${withSeconds}${NAIROBI_OFFSET}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Guest-facing night: weekday and calendar date in Nairobi, no clock. */
export function formatEventDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export type EventDayParts = {
  weekday: string;
  day: string;
  month: string;
  year: string;
};

export function eventDayParts(iso: string): EventDayParts | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month");
  const year = pick("year");
  const weekday = pick("weekday");
  if (!day || !month || !year) return null;
  return { weekday, day, month, year };
}

export type VenueLines = {
  hall: string;
  locality: string;
};

/** First comma splits studio name from town (Kirigiti, Kiambu). */
export function venueLines(venue: string): VenueLines {
  const trimmed = venue.trim();
  const i = trimmed.indexOf(",");
  if (i <= 0) return { hall: trimmed, locality: "" };
  return {
    hall: trimmed.slice(0, i).trim(),
    locality: trimmed.slice(i + 1).trim(),
  };
}

export function formatEventPlaceCompact(venue: string): string {
  const { hall, locality } = venueLines(venue);
  const town = locality.split(",")[0]?.trim() ?? "";
  return town || hall;
}

export type FlashStatus = "off" | "scheduled" | "live" | "ended";

export function flashStatus(
  enabled: boolean,
  startsAt: string | null,
  endsAt: string | null,
  now: Date = new Date(),
  dates: string[] = [],
): FlashStatus {
  if (dates.length > 0) {
    const today = nairobiDateStr(now);
    if (dates.includes(today)) return "live";
    if (dates.some((d) => d > today)) return "scheduled";
    return "ended";
  }
  if (!enabled) return "off";
  const startMs = startsAt ? new Date(startsAt).getTime() : NaN;
  const endMs = endsAt ? new Date(endsAt).getTime() : NaN;
  if (!Number.isNaN(endMs) && now.getTime() >= endMs) return "ended";
  if (!Number.isNaN(startMs) && now.getTime() < startMs) return "scheduled";
  return "live";
}
