import { describe, expect, it } from "vitest";
import { decodeUpload } from "./uploads.js";

describe("decodeUpload", () => {
  it("accepts a small PNG logo as raw base64", () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const out = decodeUpload(
      { mime: "image/png", data: bytes.toString("base64") },
      "logo",
    );
    expect("error" in out).toBe(false);
    if (!("error" in out)) {
      expect(out.mime).toBe("image/png");
      expect(out.bytes.equals(bytes)).toBe(true);
    }
  });

  it("rejects non-PDF contracts", () => {
    const out = decodeUpload(
      { mime: "text/plain", data: Buffer.from("hi").toString("base64") },
      "contract",
    );
    expect("error" in out).toBe(true);
  });

  it("reads mime from a data URL", () => {
    const payload = Buffer.from("%PDF-1.4").toString("base64");
    const out = decodeUpload(
      { mime: "application/octet-stream", data: `data:application/pdf;base64,${payload}` },
      "contract",
    );
    expect("error" in out).toBe(false);
    if (!("error" in out)) expect(out.mime).toBe("application/pdf");
  });
});
