import type { Pool, RowDataPacket } from "../db.js";
import type { Config } from "../config.js";
import { liveStkClient, mockStkClient, type StkClient } from "./client.js";
import { paystackStkClient } from "./paystack.js";

/** STK client for the configured provider. Paystack verify checks the order total. */
export function stkClientFor(config: Config, pool: Pool): StkClient {
  if (config.PAYMENT_PROVIDER === "paystack") {
    return paystackStkClient(
      { secretKey: config.PAYSTACK_SECRET_KEY ?? "" },
      async (reference) => {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT o.total_ksh
             FROM payments p
             JOIN orders o ON o.id = p.order_id
            WHERE p.checkout_request_id = ?
            LIMIT 1`,
          [reference],
        );
        const total = rows[0]?.["total_ksh"];
        const ksh = typeof total === "number" ? total : Number(total);
        if (!Number.isInteger(ksh) || ksh < 1) {
          throw new Error("paystack_order_missing");
        }
        return ksh * 100;
      },
    );
  }
  if (config.PAYMENT_PROVIDER === "daraja") {
    return liveStkClient({
      consumerKey: config.MPESA_CONSUMER_KEY ?? "",
      consumerSecret: config.MPESA_CONSUMER_SECRET ?? "",
      shortcode: config.MPESA_SHORTCODE ?? "",
      passkey: config.MPESA_PASSKEY ?? "",
      callbackUrl: config.MPESA_CALLBACK_URL ?? "",
      env: config.MPESA_ENV,
    });
  }
  return mockStkClient();
}
