import {
  darajaPassword,
  darajaTimestamp,
  parseAccessToken,
  parseStkPushResponse,
  parseStkQueryResponse,
  type StkPushParsed,
  type StkQueryParsed,
} from "./daraja.js";

export type StkPushInput = {
  phone: string;
  amountKsh: number;
  accountRef: string;
};

export type StkPushResult = StkPushParsed;

export type StkClient = {
  push: (input: StkPushInput) => Promise<StkPushResult>;
  query: (checkoutRequestId: string) => Promise<StkQueryParsed>;
};

export function mockStkClient(): StkClient {
  return {
    async push(input: StkPushInput): Promise<StkPushResult> {
      const id = `mock-${input.accountRef}`;
      return { checkoutRequestId: id, merchantRequestId: `m-${id}` };
    },
    async query(checkoutRequestId: string): Promise<StkQueryParsed> {
      return {
        resultCode: "0",
        resultDesc: `mock:${checkoutRequestId.slice(0, 8)}`,
      };
    },
  };
}

export type DarajaCreds = {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  env: "sandbox" | "production";
};

function baseUrl(env: "sandbox" | "production"): string {
  return env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function liveStkClient(creds: DarajaCreds): StkClient {
  let cached: { token: string; expMs: number } | undefined;

  async function accessToken(): Promise<string> {
    if (cached && Date.now() < cached.expMs) {
      return cached.token;
    }
    const tokenRes = await fetch(
      `${baseUrl(creds.env)}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const tokenJson = await readJson(tokenRes);
    if (!tokenRes.ok) {
      throw new Error("mpesa_token_failed");
    }
    const parsed = parseAccessToken(tokenJson);
    cached = {
      token: parsed.accessToken,
      expMs: Date.now() + Math.max(30, parsed.expiresInSec - 60) * 1000,
    };
    return parsed.accessToken;
  }

  function signedBody(): { password: string; timestamp: string } {
    const timestamp = darajaTimestamp();
    return {
      timestamp,
      password: darajaPassword(creds.shortcode, creds.passkey, timestamp),
    };
  }

  return {
    async push(input: StkPushInput): Promise<StkPushResult> {
      const token = await accessToken();
      const { password, timestamp } = signedBody();
      const stkRes = await fetch(
        `${baseUrl(creds.env)}/mpesa/stkpush/v1/processrequest`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            BusinessShortCode: creds.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: input.amountKsh,
            PartyA: input.phone,
            PartyB: creds.shortcode,
            PhoneNumber: input.phone,
            CallBackURL: creds.callbackUrl,
            AccountReference: input.accountRef.slice(0, 12),
            TransactionDesc: "Sherehe",
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      const stkJson = await readJson(stkRes);
      return parseStkPushResponse(stkJson);
    },
    async query(checkoutRequestId: string): Promise<StkQueryParsed> {
      const token = await accessToken();
      const { password, timestamp } = signedBody();
      const qRes = await fetch(
        `${baseUrl(creds.env)}/mpesa/stkpushquery/v1/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            BusinessShortCode: creds.shortcode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestId,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const qJson = await readJson(qRes);
      return parseStkQueryResponse(qJson);
    },
  };
}
