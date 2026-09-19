const NAIROBI = "Africa/Nairobi";

export function formatPdfEventDay(startsAt: Date): string {
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(startsAt);
}

export function venueHall(venue: string): string {
  const i = venue.indexOf(",");
  return (i > 0 ? venue.slice(0, i) : venue).trim();
}

export function venueLocality(venue: string): string {
  const i = venue.indexOf(",");
  return i > 0 ? venue.slice(i + 1).trim() : "";
}
