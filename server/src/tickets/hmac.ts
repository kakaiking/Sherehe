import { createHmac } from "node:crypto";

export function signTicketPublicId(publicId: string, secret: string): string {
  return createHmac("sha256", secret).update(publicId).digest("hex");
}

export function verifyTicketSignature(
  publicId: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signTicketPublicId(publicId, secret);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
