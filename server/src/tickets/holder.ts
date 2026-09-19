const DISPLAY_MAX = 80;
const GIVEN_MAX = 40;

function collapseWs(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Full guest name from Google (or a fallback). Null when empty after sanitizing. */
export function sanitizeDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = collapseWs(raw).slice(0, DISPLAY_MAX);
  return cleaned.length > 0 ? cleaned : null;
}

/** First name token from Google given_name, else the first word of the display name. */
export function sanitizeGivenName(
  given: string | null | undefined,
  displayName: string | null,
): string | null {
  const fromGiven = given ? collapseWs(given).slice(0, GIVEN_MAX) : "";
  if (fromGiven) return fromGiven;
  if (!displayName) return null;
  const first = displayName.split(" ")[0] ?? "";
  const cleaned = first.slice(0, GIVEN_MAX);
  return cleaned.length > 0 ? cleaned : null;
}

function emailLocalLabel(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  return sanitizeDisplayName(local.replace(/[._+-]+/g, " "));
}

/**
 * Text drawn on the stub signature line: the buyer's name, or "{first}'s group"
 * for a group package.
 */
export function stubHolderCaption(opts: {
  ticketCode: string;
  displayName: string | null;
  givenName: string | null;
  email: string;
}): string {
  const display =
    sanitizeDisplayName(opts.displayName) ?? emailLocalLabel(opts.email) ?? "Guest";
  const given = sanitizeGivenName(opts.givenName, display) ?? display;
  if (opts.ticketCode === "group") {
    return `${given}'s group`;
  }
  return display;
}
