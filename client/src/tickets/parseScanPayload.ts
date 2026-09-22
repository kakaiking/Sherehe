export type TicketScanPayload = {
  publicId: string;
  signature: string;
};

const PUBLIC_ID = /^[a-f0-9]{32}$/i;
const SIGNATURE = /^[a-f0-9]{64}$/i;

/**
 * Accepts a gate QR payload: pass URL, legacy JSON `{id,sig}`, or
 * `{publicId,signature}`.
 */
export function parseTicketScanPayload(raw: string): TicketScanPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fromUrl = parsePassUrl(trimmed);
  if (fromUrl) return fromUrl;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const publicId =
        typeof parsed["id"] === "string"
          ? parsed["id"]
          : typeof parsed["publicId"] === "string"
            ? parsed["publicId"]
            : null;
      const signature =
        typeof parsed["sig"] === "string"
          ? parsed["sig"]
          : typeof parsed["signature"] === "string"
            ? parsed["signature"]
            : null;
      if (
        publicId &&
        signature &&
        PUBLIC_ID.test(publicId) &&
        SIGNATURE.test(signature)
      ) {
        return { publicId: publicId.toLowerCase(), signature: signature.toLowerCase() };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function parsePassUrl(raw: string): TicketScanPayload | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Relative path from some scanners.
    try {
      url = new URL(raw, "https://sherehe.local");
    } catch {
      return null;
    }
  }
  const match = url.pathname.match(/\/pass\/([a-f0-9]{32})\/?$/i);
  if (!match) return null;
  const publicId = match[1]!;
  const signature = url.searchParams.get("sig") ?? "";
  if (!SIGNATURE.test(signature)) return null;
  return {
    publicId: publicId.toLowerCase(),
    signature: signature.toLowerCase(),
  };
}
