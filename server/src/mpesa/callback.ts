import { z } from "zod";

/** Daraja STK callback body — validated, never trusted as paid until ResultCode === 0. */
export const StkCallbackBody = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string().max(64),
      CheckoutRequestID: z.string().max(64),
      ResultCode: z.number(),
      ResultDesc: z.string().max(400).optional(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string().max(64),
              Value: z.union([z.string(), z.number()]).optional(),
            }),
          ),
        })
        .optional(),
    }),
  }),
});

export function receiptFromCallback(
  body: z.infer<typeof StkCallbackBody>,
): string | null {
  const items = body.Body.stkCallback.CallbackMetadata?.Item ?? [];
  const rec = items.find((i) => i.Name === "MpesaReceiptNumber");
  if (!rec || rec.Value === undefined) return null;
  return String(rec.Value).slice(0, 64);
}
