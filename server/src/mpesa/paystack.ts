import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { StkClient, StkPushInput, StkPushResult } from "./client.js";
import type { StkQueryParsed } from "./daraja.js";

const CHARGE_URL = "https://api.paystack.co/charge";

export type PaystackCreds = {
  secretKey: string;
};

/** Paystack signs the raw body with HMAC-SHA512 of the secret key. */
export function paystackSignatureOk(
  rawBody: Buffer,
  signature: string | undefined,
  secretKey: string,
): boolean {
  if (!signature || signature.length < 32 || signature.length > 256) {
    return false;
  }
  const digest = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(signature, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function paystackReference(): string {
  return `sh${randomBytes(16).toString("hex")}`;
}

function asRecord(json: unknown): Record<string, unknown> | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  return json as Record<string, unknown>;
}

/** Paystack test mode rejects every real Safaricom number. */
export const PAYSTACK_TEST_MPESA = "254710000000";

/** Paystack Kenya STK expects a leading plus on the MSISDN. */
export function paystackPhone(msisdn: string): string {
  const digits = msisdn.replace(/\D/g, "");
  return digits.startsWith("254") ? `+${digits}` : `+254${digits}`;
}

/** Live keys charge the guest. Test keys must use Paystack's Kenya test number. */
export function paystackChargePhone(phone: string, secretKey: string): string {
  if (secretKey.startsWith("sk_test_")) return paystackPhone(PAYSTACK_TEST_MPESA);
  return paystackPhone(phone);
}

const PROMPT_STATUSES = new Set([
  "pay_offline",
  "pending",
  "ongoing",
  "processing",
  "queued",
  "open_url",
  "send_otp",
  "send_pin",
  "send_phone",
]);

function safeProviderText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^\w .'-]/g, "").trim().slice(0, 80);
}

function chargeReference(data: Record<string, unknown> | undefined, sentReference: string): string {
  const echoed = typeof data?.["reference"] === "string" ? data["reference"] : "";
  return (echoed || sentReference).slice(0, 64);
}

function chargeResult(
  data: Record<string, unknown> | undefined,
  reference: string,
): StkPushResult {
  const id = data?.["id"];
  const merchant =
    typeof id === "number" || typeof id === "string" ? String(id).slice(0, 64) : reference;
  return { checkoutRequestId: reference, merchantRequestId: merchant };
}

function chargeFailure(root: Record<string, unknown> | undefined, data: Record<string, unknown> | undefined): Error {
  const specific = [
    safeProviderText(data?.["gateway_response"]),
    safeProviderText(data?.["message"]),
    safeProviderText(root?.["message"]),
  ].find((text) => text && text.toLowerCase() !== "charge attempted");
  return new Error(specific ? `paystack_charge_failed:${specific}` : "paystack_charge_failed");
}

/**
 * Charge accepted and the phone should show an STK prompt (`pay_offline`).
 * Paystack's success message is "Charge attempted" on both accepted and declined
 * charges, so that text is not a failure. A prompt status is enough even when
 * the top-level `status` flag is false. Some M-Pesa responses omit
 * `data.reference`; the reference we sent on the request is then the id to poll.
 */
export function parsePaystackCharge(json: unknown, sentReference: string): StkPushResult {
  const root = asRecord(json);
  const data = asRecord(root?.["data"]);
  const reference = chargeReference(data, sentReference);
  const status = typeof data?.["status"] === "string" ? data["status"] : "";
  if (reference && (PROMPT_STATUSES.has(status) || status === "success")) {
    return chargeResult(data, reference);
  }
  const ok = root?.["status"] === true;
  if (ok && reference && status !== "failed" && status !== "abandoned" && status !== "reversed") {
    return chargeResult(data, reference);
  }
  throw chargeFailure(root, data);
}

/**
 * Charge said the attempt failed, but verify can still show the STK is in flight.
 * Returns the checkout ids when the transaction is waiting or already paid.
 */
export function recoverPaystackCharge(json: unknown, sentReference: string): StkPushResult | null {
  const root = asRecord(json);
  const data = asRecord(root?.["data"]);
  if (root?.["status"] !== true || !data) return null;
  const status = typeof data["status"] === "string" ? data["status"] : "";
  const reference = chargeReference(data, sentReference);
  if (!reference) return null;
  if (status === "success" || PROMPT_STATUSES.has(status)) {
    return chargeResult(data, reference);
  }
  return null;
}

function receiptFromVerify(data: Record<string, unknown>, reference: string): string {
  const receipt = data["receipt_number"];
  if (typeof receipt === "string" && /^[A-Za-z0-9]{6,20}$/.test(receipt)) {
    return receipt;
  }
  return reference.slice(0, 64);
}

/**
 * Map Paystack verify JSON onto the STK outcome codes the checkout already uses.
 * `0` paid, `4999` still waiting, anything else failed.
 * Amount is subunits (KES cents). A mismatch stays pending so we never fulfill
 * a charge that does not match the order.
 */
export function parsePaystackVerify(
  json: unknown,
  expectedSubunits: number,
): StkQueryParsed {
  const root = asRecord(json);
  const data = asRecord(root?.["data"]);
  if (root?.["status"] !== true || !data) {
    throw new Error("paystack_verify_failed");
  }
  const status = typeof data["status"] === "string" ? data["status"] : "";
  const reference = typeof data["reference"] === "string" ? data["reference"] : "";
  if (status === "success") {
    const amount = data["amount"];
    const currency = data["currency"];
    const subunits = typeof amount === "number" ? amount : Number(amount);
    if (
      currency !== "KES" ||
      !Number.isInteger(subunits) ||
      subunits !== expectedSubunits
    ) {
      return { resultCode: "4999", resultDesc: "amount_mismatch", paidAmountSubunits: subunits };
    }
    return {
      resultCode: "0",
      resultDesc: receiptFromVerify(data, reference),
      paidAmountSubunits: subunits,
    };
  }
  if (
    status === "pending" ||
    status === "ongoing" ||
    status === "processing" ||
    status === "pay_offline" ||
    status === "queued"
  ) {
    return { resultCode: "4999", resultDesc: status };
  }
  return { resultCode: "1", resultDesc: status || "failed" };
}

export function paystackStkClient(
  creds: PaystackCreds,
  expectedSubunitsFor: (reference: string) => Promise<number>,
): StkClient {
  async function authed(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${creds.secretKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  return {
    async push(input: StkPushInput): Promise<StkPushResult> {
      const email = input.email?.trim().toLowerCase() ?? "";
      if (!email.includes("@")) {
        throw new Error("paystack_email_required");
      }
      const reference = paystackReference();
      const json = await authed(CHARGE_URL, {
        method: "POST",
        body: JSON.stringify({
          amount: input.amountKsh * 100,
          email,
          currency: "KES",
          reference,
          metadata: { account_ref: input.accountRef.slice(0, 12) },
          mobile_money: { phone: paystackChargePhone(input.phone, creds.secretKey), provider: "mpesa" },
        }),
      });
      try {
        return parsePaystackCharge(json, reference);
      } catch (err) {
        const verified = await authed(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
          { method: "GET" },
        );
        const recovered = recoverPaystackCharge(verified, reference);
        if (recovered) return recovered;
        const verifyData = asRecord(asRecord(verified)?.["data"]);
        const clearer = chargeFailure(asRecord(verified), verifyData);
        if (clearer.message !== "paystack_charge_failed") throw clearer;
        throw err;
      }
    },
    async query(checkoutRequestId: string): Promise<StkQueryParsed> {
      const expected = await expectedSubunitsFor(checkoutRequestId);
      const json = await authed(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(checkoutRequestId)}`,
        { method: "GET" },
      );
      return parsePaystackVerify(json, expected);
    },
  };
}
