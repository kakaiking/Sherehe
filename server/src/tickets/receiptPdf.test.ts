import { describe, expect, it } from "vitest";
import { productReceiptPdf } from "./receiptPdf.js";

describe("productReceiptPdf", () => {
  it("writes a branded receipt without order ids", async () => {
    const buf = await productReceiptPdf({
      title: "Nyama choma",
      qty: 2,
      totalKsh: 2400,
      holderName: "Walter Kamau",
      mpesaReceipt: "MOCKABCD",
      paidAt: new Date("2026-09-18T08:50:00.000Z"),
    });
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
    const asLatin = buf.toString("latin1");
    expect(asLatin).not.toContain("11111111");
  });
});
