import { createHash, timingSafeEqual } from "node:crypto";

function emailDigest(email: string): Buffer {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest();
}

/**
 * True when this Google email is one of the configured admin addresses.
 * Compares SHA-256 digests so the check does not stop on the first match
 * and does not leak which address matched through string length.
 * An empty allowlist never matches.
 */
export function isStaffEmail(
  email: string,
  staffEmails: readonly string[],
): boolean {
  if (staffEmails.length === 0) return false;
  const needle = emailDigest(email);
  let matched = 0;
  for (const allowed of staffEmails) {
    matched |= timingSafeEqual(needle, emailDigest(allowed)) ? 1 : 0;
  }
  return matched === 1;
}
