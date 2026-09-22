/** Decode and bound partner upload payloads (logo image or PDF contract). */

const LOGO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CONTRACT_MIMES = new Set(["application/pdf"]);

export const LOGO_MAX_BYTES = 400_000;
export const CONTRACT_MAX_BYTES = 2_000_000;

export type DecodedUpload = {
  mime: string;
  bytes: Buffer;
};

function stripDataUrl(raw: string): { mime: string | null; b64: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(raw.trim());
  if (match) {
    return { mime: match[1] ?? null, b64: match[2] ?? "" };
  }
  return { mime: null, b64: raw.trim() };
}

export function decodeUpload(
  input: { mime: string; data: string },
  kind: "logo" | "contract",
): DecodedUpload | { error: string } {
  const allowed = kind === "logo" ? LOGO_MIMES : CONTRACT_MIMES;
  const max = kind === "logo" ? LOGO_MAX_BYTES : CONTRACT_MAX_BYTES;
  const stripped = stripDataUrl(input.data);
  const mime = (stripped.mime ?? input.mime).toLowerCase();
  if (!allowed.has(mime)) {
    return {
      error:
        kind === "logo"
          ? "Logo must be a JPEG, PNG, or WebP image."
          : "Terms of service must be a PDF.",
    };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(stripped.b64, "base64");
  } catch {
    return { error: "Upload data is invalid." };
  }
  if (bytes.length === 0) {
    return { error: "Upload is empty." };
  }
  if (bytes.length > max) {
    return {
      error:
        kind === "logo"
          ? "Logo is too large (max about 400 KB)."
          : "Contract PDF is too large (max about 2 MB).",
    };
  }
  return { mime, bytes };
}
