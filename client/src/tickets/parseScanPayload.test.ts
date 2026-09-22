import { describe, expect, it } from "vitest";
import { parseTicketScanPayload } from "./parseScanPayload";

const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const sig =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("parseTicketScanPayload", () => {
  it("parses a pass URL", () => {
    expect(
      parseTicketScanPayload(`https://sherehe.example/pass/${id}?sig=${sig}`),
    ).toEqual({ publicId: id, signature: sig });
  });

  it("parses legacy JSON payloads", () => {
    expect(
      parseTicketScanPayload(JSON.stringify({ id, sig })),
    ).toEqual({ publicId: id, signature: sig });
  });

  it("rejects garbage", () => {
    expect(parseTicketScanPayload("not-a-ticket")).toBeNull();
    expect(parseTicketScanPayload(`https://example.com/other/${id}?sig=${sig}`)).toBeNull();
  });
});
