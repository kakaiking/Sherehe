import { describe, expect, it } from "vitest";
import { receiptFromCallback, StkCallbackBody } from "./callback.js";

describe("StkCallbackBody", () => {
  it("parses a success payload and extracts the receipt", () => {
    const body = {
      Body: {
        stkCallback: {
          MerchantRequestID: "m1",
          CheckoutRequestID: "c1",
          ResultCode: 0,
          ResultDesc: "ok",
          CallbackMetadata: {
            Item: [{ Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" }],
          },
        },
      },
    };
    const parsed = StkCallbackBody.parse(body);
    expect(receiptFromCallback(parsed)).toBe("NLJ7RT61SV");
  });

  it("rejects a missing checkout id", () => {
    expect(() =>
      StkCallbackBody.parse({
        Body: { stkCallback: { MerchantRequestID: "m", ResultCode: 0 } },
      }),
    ).toThrow();
  });
});
