const NAIROBI = "Africa/Nairobi";

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
