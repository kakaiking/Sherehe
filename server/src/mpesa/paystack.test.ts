import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  parsePaystackCharge,
  parsePaystackVerify,
  paystackSignatureOk,
  paystackStkClient,
} from "./paystack.js";

describe("paystack parsers", () => {
  it("accepts a pay_offline charge and keeps our reference", () => {
    expect(
      parsePaystackCharge({
        status: true,
        data: { reference: "shabc", status: "pay_offline", id: 9 },
      }),
    ).toEqual({ checkoutRequestId: "shabc", merchantRequestId: "9" });
  });

  it("rejects a failed charge", () => {
    expect(() =>
      parsePaystackCharge({
        status: true,
        data: { reference: "shabc", status: "failed" },
      }),
    ).toThrow(/paystack_charge_failed/);
  });

  it("maps a matching KES success to paid and a short receipt", () => {
    expect(
      parsePaystackVerify(
        {
          status: true,
          data: {
            status: "success",
            amount: 150000,
            currency: "KES",
            reference: "shabc",
            receipt_number: "UBX12CD34",
          },
        },
        150000,
      ),
    ).toEqual({
      resultCode: "0",
      resultDesc: "UBX12CD34",
      paidAmountSubunits: 150000,
    });
  });

  it("holds an amount mismatch as pending", () => {
    expect(
      parsePaystackVerify(
        {
          status: true,
          data: { status: "success", amount: 100, currency: "KES", reference: "shabc" },
        },
        150000,
      ).resultCode,
    ).toBe("4999");
  });

  it("keeps pay_offline pending and failed as failed", () => {
    expect(
      parsePaystackVerify(
        { status: true, data: { status: "pay_offline", reference: "shabc" } },
        100,
      ).resultCode,
    ).toBe("4999");
    expect(
      parsePaystackVerify(
        { status: true, data: { status: "failed", reference: "shabc" } },
        100,
      ).resultCode,
    ).toBe("1");
  });

  it("checks the Paystack HMAC over the raw body", () => {
    const raw = Buffer.from('{"event":"charge.success"}');
    const sig = createHmac("sha512", "sk_test_abc").update(raw).digest("hex");
    expect(paystackSignatureOk(raw, sig, "sk_test_abc")).toBe(true);
    expect(paystackSignatureOk(raw, sig, "sk_test_other")).toBe(false);
    expect(paystackSignatureOk(raw, undefined, "sk_test_abc")).toBe(false);
  });
});

describe("paystackStkClient", () => {
  it("charges M-Pesa in KES subunits and sends the guest phone", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        status: true,
        data: { reference: "ignored-server-ref", status: "pay_offline", id: 1 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const stk = paystackStkClient(
      { secretKey: "sk_test_abc" },
      async () => 20000,
    );
    await stk.push({
      phone: "254707775994",
      amountKsh: 200,
      accountRef: "abc",
      email: "Guest@Example.com",
    });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const init = calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as {
      amount: number;
      email: string;
      currency: string;
      mobile_money: { phone: string; provider: string };
    };
    expect(body.amount).toBe(20000);
    expect(body.email).toBe("guest@example.com");
    expect(body.currency).toBe("KES");
    expect(body.mobile_money).toEqual({ phone: "254707775994", provider: "mpesa" });
    vi.unstubAllGlobals();
  });
});
