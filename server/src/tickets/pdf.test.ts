import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { ticketsPdf } from "./pdf.js";

describe("ticketsPdf", () => {
  it("writes a branded PDF without guest-facing ids", async () => {
    const qrDataUrl = await QRCode.toDataURL("sherehe-test", {
      margin: 1,
      width: 128,
    });
    const publicId = "abcdef12deadbeef";
    const buf = await ticketsPdf([
      { publicId, qrDataUrl, code: "early_bird", holderName: "Walter Kamau" },
    ]);
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
    const asLatin = buf.toString("latin1");
    expect(asLatin).not.toContain(publicId);
    expect(asLatin).not.toContain(publicId.slice(0, 8));
    expect(asLatin).not.toContain("11111111");
    expect(asLatin).not.toContain("KSh");
  });

  it("accepts a long group holder caption without throwing", async () => {
    const qrDataUrl = await QRCode.toDataURL("sherehe-test", {
      margin: 1,
      width: 128,
    });
    const buf = await ticketsPdf([
      {
        publicId: "abcdef12deadbeef",
        qrDataUrl,
        code: "group",
        holderName: "Bartholomew's group",
      },
    ]);
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
