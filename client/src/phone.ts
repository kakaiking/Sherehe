/** Kenyan national number: 9 digits after country code 254. */
export const KENYAN_NATIONAL_LEN = 9;

/**
 * Digits after +254, capped at 9. Strips 254 / leading 0 so paste of
 * 07…, 254…, or +254… lands in the same field.
 */
export function extractKenyanNationalDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let national = digits;
  if (digits.startsWith("254")) {
    national = digits.slice(3);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  }
  return national.slice(0, KENYAN_NATIONAL_LEN);
}

/** Remaining national digits as 3-3-3 groups (712 345 678). */
export function formatKenyanNational(raw: string): string {
  const d = extractKenyanNationalDigits(raw);
  const chunks = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(
    (chunk) => chunk.length > 0,
  );
  return chunks.join(" ");
}

export function formatKenyanMsisdnDisplay(raw: string): string {
  const spaced = formatKenyanNational(raw);
  return spaced ? `+254 ${spaced}` : "+254";
}

export function kenyanPhonePayload(raw: string): string {
  return `+254${extractKenyanNationalDigits(raw)}`;
}

export function isCompleteKenyanNational(raw: string): boolean {
  return /^[17]\d{8}$/.test(extractKenyanNationalDigits(raw));
}

/** Maps a digit count onto a caret index in a spaced display string. */
export function caretIndexForDigitCount(
  formatted: string,
  digitCount: number,
): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    const ch = formatted.charAt(i);
    if (ch >= "0" && ch <= "9") {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return formatted.length;
}
