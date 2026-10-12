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

/** Paystack Kenya STK expects a leading plus on the MSISDN. */
export function paystackPhone(msisdn: string): string {
  const digits = msisdn.replace(/\D/g, "");
  return digits.startsWith("254") ? `+${digits}` : `+254${digits}`;
}

/** Charge accepted and the phone should show an STK prompt (`pay_offline`). */
export function parsePaystackCharge(json: unknown): StkPushResult {
  const root = asRecord(json);
  const data = asRecord(root?.["data"]);
  const ok = root?.["status"] === true;
  const reference = typeof data?.["reference"] === "string" ? data["reference"] : "";
  const status = typeof data?.["status"] === "string" ? data["status"] : "";
  if (!ok || !reference || status === "failed") {
    const message = typeof root?.["message"] === "string" ? root["message"] : "";
    const safe = message.replace(/[^\w .'-]/g, "").slice(0, 80);
    throw new Error(safe ? `paystack_charge_failed:${safe}` : "paystack_charge_failed");
  }
  const id = data?.["id"];
  const merchant =
    typeof id === "number" || typeof id === "string" ? String(id).slice(0, 64) : reference;
  return { checkoutRequestId: reference.slice(0, 64), merchantRequestId: merchant };
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
          mobile_money: { phone: paystackPhone(input.phone), provider: "mpesa" },
        }),
      });
      return parsePaystackCharge(json);
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
