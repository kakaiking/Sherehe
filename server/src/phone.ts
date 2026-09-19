/**
 * Kenyan MSISDN helpers. Accepts 07…, 01…, +254…, 254….
 * Returns canonical 254XXXXXXXXX or null.
 */
export function normalizeKenyanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let national: string;
  if (digits.startsWith("254") && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith("0") && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  } else {
    return null;
  }
  if (!/^[17]\d{8}$/.test(national)) {
    return null;
  }
  return `254${national}`;
}

export const STK_PHONE_NEEDED =
  "Add a Kenyan mobile so M-Pesa can reach you.";

/** STK Push needs a stored Kenyan MSISDN. */
export function stkPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return normalizeKenyanPhone(phone);
}
