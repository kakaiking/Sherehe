import { afterEach, describe, expect, it, vi } from "vitest";
import { liveStkClient } from "./client.js";

const creds = {
  consumerKey: "ck",
  consumerSecret: "cs",
  shortcode: "174379",
  passkey: "pass",
  callbackUrl: "https://example.test/v1/payments/mpesa/callback",
  env: "sandbox" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("liveStkClient", () => {
  it("caches the oauth token across push and query", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth/v1/generate")) {
        return {
          ok: true,
          json: async () => ({ access_token: "tok-1", expires_in: 3599 }),
        };
      }
      if (url.includes("/stkpush/v1/processrequest")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer tok-1" });
        return {
          ok: true,
          json: async () => ({
            MerchantRequestID: "m",
            CheckoutRequestID: "ws_CO_1",
            ResponseCode: "0",
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ResultCode: "0", ResultDesc: "ok" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const stk = liveStkClient(creds);
    await stk.push({ phone: "254700000000", amountKsh: 2000, accountRef: "abc" });
    await stk.query("ws_CO_1");
    const oauthCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/oauth/v1/generate"),
    );
    expect(oauthCalls).toHaveLength(1);
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("/stkpushquery/v1/query")),
    ).toBe(true);
  });
});
