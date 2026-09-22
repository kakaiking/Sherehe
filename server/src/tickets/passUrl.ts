/** Absolute URL encoded in gate QRs — phone cameras open this page. */
export function ticketPassUrl(
  clientOrigin: string,
  publicId: string,
  signature: string,
): string {
  const base = clientOrigin.replace(/\/$/, "");
  const url = new URL(`${base}/pass/${encodeURIComponent(publicId)}`);
  url.searchParams.set("sig", signature);
  return url.toString();
}
