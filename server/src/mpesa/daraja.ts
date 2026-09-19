/** Daraja STK helpers. Timestamps are Africa/Nairobi (Safaricom password clock). */

export function darajaTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const take = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${take("year")}${take("month")}${take("day")}${take("hour")}${take("minute")}${take("second")}`;
}

export function darajaPassword(
  shortcode: string,
  passkey: string,
  timestamp: string,
): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

export function parseAccessToken(json: unknown): {
  accessToken: string;
  expiresInSec: number;
} {
  if (typeof json !== "object" || json === null) {
    throw new Error("mpesa_token_missing");
  }
  const access =
    "access_token" in json && typeof json.access_token === "string"
      ? json.access_token
      : null;
  if (!access) {
    throw new Error("mpesa_token_missing");
  }
  const expiresRaw =
    "expires_in" in json ? json.expires_in : 3599;
  const expiresInSec =
    typeof expiresRaw === "number"
      ? expiresRaw
      : typeof expiresRaw === "string"
        ? Number(expiresRaw)
        : 3599;
  return {
    accessToken: access,
    expiresInSec: Number.isFinite(expiresInSec) ? expiresInSec : 3599,
  };
}

export type StkPushParsed = {
  checkoutRequestId: string;
  merchantRequestId: string;
};

export function parseStkPushResponse(json: unknown): StkPushParsed {
  if (typeof json !== "object" || json === null) {
    throw new Error("mpesa_stk_failed");
  }
  const code =
    "ResponseCode" in json ? String(json.ResponseCode) : "";
  const checkout =
    "CheckoutRequestID" in json && typeof json.CheckoutRequestID === "string"
      ? json.CheckoutRequestID
      : null;
  if (code !== "0" || !checkout) {
    throw new Error("mpesa_stk_failed");
  }
  const merchant =
    "MerchantRequestID" in json && typeof json.MerchantRequestID === "string"
      ? json.MerchantRequestID
      : "";
  return { checkoutRequestId: checkout, merchantRequestId: merchant };
}

export type StkQueryParsed = {
  resultCode: string;
  resultDesc: string;
};

export function parseStkQueryResponse(json: unknown): StkQueryParsed {
  if (typeof json !== "object" || json === null) {
    throw new Error("mpesa_stk_query_failed");
  }
  const resultCode =
    "ResultCode" in json && json.ResultCode !== undefined
      ? String(json.ResultCode)
      : "";
  const resultDesc =
    "ResultDesc" in json && typeof json.ResultDesc === "string"
      ? json.ResultDesc.slice(0, 400)
      : "";
  if (!resultCode) {
    const responseCode =
      "ResponseCode" in json ? String(json.ResponseCode) : "";
    if (responseCode === "500.001.1001") {
      return { resultCode: "4999", resultDesc: resultDesc || "processing" };
    }
    throw new Error("mpesa_stk_query_failed");
  }
  return { resultCode, resultDesc };
}

export type StkOutcome = "paid" | "pending" | "failed";

/** Map Daraja ResultCode to a checkout outcome. */
export function stkOutcome(resultCode: string): StkOutcome {
  if (resultCode === "0") return "paid";
  if (resultCode === "4999") return "pending";
  return "failed";
}
