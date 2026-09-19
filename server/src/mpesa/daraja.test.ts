import { describe, expect, it } from "vitest";
import {
  darajaPassword,
  darajaTimestamp,
  parseAccessToken,
  parseStkPushResponse,
  parseStkQueryResponse,
  stkOutcome,
} from "./daraja.js";

describe("darajaTimestamp", () => {
  it("formats Africa/Nairobi, not UTC", () => {
    const utc = new Date("2026-09-18T07:43:00.000Z");
    expect(darajaTimestamp(utc)).toBe("20260918104300");
  });
});

describe("darajaPassword", () => {
  it("base64-encodes shortcode + passkey + timestamp", () => {
    expect(darajaPassword("174379", "key", "20260918104300")).toBe(
      Buffer.from("174379key20260918104300").toString("base64"),
    );
  });
});

describe("parseAccessToken", () => {
  it("reads token and expiry", () => {
    expect(
      parseAccessToken({ access_token: "tok", expires_in: "3599" }),
    ).toEqual({ accessToken: "tok", expiresInSec: 3599 });
  });

  it("rejects a body without a token", () => {
    expect(() => parseAccessToken({ error: "invalid_client" })).toThrow(
      "mpesa_token_missing",
    );
  });
});

describe("parseStkPushResponse", () => {
  it("requires ResponseCode 0 and a checkout id", () => {
    expect(
      parseStkPushResponse({
        MerchantRequestID: "m1",
        CheckoutRequestID: "ws_CO_1",
        ResponseCode: "0",
      }),
    ).toEqual({ checkoutRequestId: "ws_CO_1", merchantRequestId: "m1" });
  });

  it("rejects a Daraja error envelope", () => {
    expect(() =>
      parseStkPushResponse({
        requestId: "x",
        errorCode: "400.002.02",
        errorMessage: "Bad Request",
      }),
    ).toThrow("mpesa_stk_failed");
  });
});

describe("parseStkQueryResponse", () => {
  it("reads a paid ResultCode", () => {
    expect(
      parseStkQueryResponse({
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
      }),
    ).toEqual({
      resultCode: "0",
      resultDesc: "The service request is processed successfully.",
    });
  });

  it("treats still-processing as 4999", () => {
    expect(
      parseStkQueryResponse({
        ResponseCode: "500.001.1001",
        ResponseDescription: "The transaction is being processed",
      }),
    ).toEqual({ resultCode: "4999", resultDesc: "processing" });
  });
});

describe("stkOutcome", () => {
  it("maps Daraja result codes", () => {
    expect(stkOutcome("0")).toBe("paid");
    expect(stkOutcome("4999")).toBe("pending");
    expect(stkOutcome("1032")).toBe("failed");
    expect(stkOutcome("1037")).toBe("failed");
  });
});
