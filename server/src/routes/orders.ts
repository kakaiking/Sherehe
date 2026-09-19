import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "../db.js";
import type { Config } from "../config.js";
import type { StkClient } from "../mpesa/client.js";
import { requireUser } from "../auth/session.js";
import {
  createTicketOrder,
  fulfillPaidOrder,
  markTicketStubDownloaded,
  ticketsForOrder,
} from "../sale/orders.js";
import { receiptFromCallback, StkCallbackBody } from "../mpesa/callback.js";
import { stkOutcome } from "../mpesa/daraja.js";
import { ticketsPdf } from "../tickets/pdf.js";
import { productReceiptPdf } from "../tickets/receiptPdf.js";
import { stubHolderCaption } from "../tickets/holder.js";
import { log } from "../log.js";
import type { TicketCode } from "../sale/engine.js";
import { stkPhone, STK_PHONE_NEEDED } from "../phone.js";
import { EVENT_STARTS_AT, EVENT_VENUE } from "../eventFacts.js";

const TicketOrderBody = z.object({
  code: z.enum([
    "early_bird",
    "rush",
    "regular",
    "vip",
    "viip",
    "group",
    "flash",
  ]),
  qty: z.number().int().min(1).max(20),
});

const checkoutErrors: Record<string, { status: number; detail: string }> = {
  not_on_sale: { status: 409, detail: "That ticket is not on sale right now." },
  sold_out: { status: 409, detail: "That ticket is sold out." },
  flash_closed: {
    status: 409,
    detail: "The flash sale is closed. Remaining tickets are at regular or premium prices.",
  },
  invalid_qty: { status: 422, detail: "Choose between 1 and 20 packages." },
};

type PaymentRow = {
  id: string;
  order_id: string;
  checkout_request_id: string;
  status: string;
};

async function applyStkOutcome(
  pool: Pool,
  config: Config,
  checkoutRequestId: string,
  resultCode: string,
  receipt: string | null,
): Promise<"paid" | "pending" | "failed"> {
  const outcome = stkOutcome(resultCode);
  const [payRows] = await pool.query<RowDataPacket[]>(
    "SELECT order_id, status FROM payments WHERE checkout_request_id = ?",
    [checkoutRequestId],
  );
  const pay = payRows[0] as { order_id: string; status: string } | undefined;
  if (!pay) {
    return "pending";
  }
  if (pay.status === "succeeded") {
    return "paid";
  }
  if (outcome === "pending") {
    return "pending";
  }
  if (outcome === "paid") {
    await pool.query(
      "UPDATE payments SET status = 'succeeded', result_code = ?, receipt = ? WHERE checkout_request_id = ?",
      [resultCode, receipt, checkoutRequestId],
    );
    await fulfillPaidOrder(pool, pay.order_id, config.TICKET_SIGNING_SECRET);
    return "paid";
  }
  await pool.query(
    "UPDATE payments SET status = 'failed', result_code = ? WHERE checkout_request_id = ?",
    [resultCode, checkoutRequestId],
  );
  await pool.query(
    "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
    [pay.order_id],
  );
  return "failed";
}

async function loadOwnedOrder(
  pool: Pool,
  user: { id: string; role: string },
  orderId: string,
): Promise<
  | {
      id: string;
      user_id: string;
      kind: string;
      status: string;
      total_ksh: number;
      created_at: Date;
      paid_at: Date | null;
    }
  | undefined
> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, user_id, kind, status, total_ksh, created_at, paid_at FROM orders WHERE id = ?",
    [orderId],
  );
  const order = rows[0] as
    | {
        id: string;
        user_id: string;
        kind: string;
        status: string;
        total_ksh: number;
        created_at: Date;
        paid_at: Date | null;
      }
    | undefined;
  if (!order || (order.user_id !== user.id && user.role !== "staff")) {
    return undefined;
  }
  return order;
}

export function ordersRouter(
  pool: Pool,
  config: Config,
  stk: StkClient,
): Router {
  const r = Router();

  r.post("/tickets", requireUser, async (req, res, next) => {
    try {
      const parsed = TicketOrderBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Choose a ticket type and quantity.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      const payPhone = stkPhone(user.phone);
      if (!payPhone) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: STK_PHONE_NEEDED,
        });
        return;
      }
      let created;
      try {
        created = await createTicketOrder(
          pool,
          user.id,
          parsed.data.code as TicketCode,
          parsed.data.qty,
        );
      } catch (err) {
        const name = (err as Error).message;
        const mapped = checkoutErrors[name];
        if (mapped) {
          res.status(mapped.status).json({
            type: `https://httpstatuses.com/${mapped.status}`,
            title: mapped.status === 422 ? "Unprocessable Entity" : "Conflict",
            status: mapped.status,
            detail: mapped.detail,
          });
          return;
        }
        throw err;
      }
      let stkRes;
      try {
        stkRes = await stk.push({
          phone: payPhone,
          amountKsh: created.totalKsh,
          accountRef: created.orderId.replace(/-/g, "").slice(0, 12),
        });
      } catch {
        await pool.query(
          "UPDATE orders SET status = 'cancelled', hold_expires_at = NULL WHERE id = ?",
          [created.orderId],
        );
        res.status(502).json({
          type: "https://httpstatuses.com/502",
          title: "Bad Gateway",
          status: 502,
          detail: "M-Pesa did not accept the payment request. Try again.",
        });
        return;
      }
      await pool.query(
        `INSERT INTO payments (id, order_id, provider, checkout_request_id, merchant_request_id, status)
         VALUES (?, ?, 'mpesa', ?, ?, 'pending')`,
        [
          randomUUID(),
          created.orderId,
          stkRes.checkoutRequestId,
          stkRes.merchantRequestId,
        ],
      );
      if (config.MPESA_MODE === "mock") {
        await applyStkOutcome(
          pool,
          config,
          stkRes.checkoutRequestId,
          "0",
          `MOCK${created.orderId.slice(0, 8)}`,
        );
      }
      res.status(201).json({
        orderId: created.orderId,
        totalKsh: created.totalKsh,
        holdExpiresAt: created.holdExpiresAt,
        payment: {
          mode: config.MPESA_MODE,
          checkoutRequestId: stkRes.checkoutRequestId,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/:id/tickets.pdf", requireUser, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params["id"]);
      if (!id.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid order id.",
        });
        return;
      }
      const order = await loadOwnedOrder(pool, user, id.data);
      if (!order) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Order not found.",
        });
        return;
      }
      if (order.kind !== "tickets" || order.status !== "paid") {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "Tickets are ready after M-Pesa confirms payment.",
        });
        return;
      }
      const tickets = await ticketsForOrder(
        pool,
        order.id,
        config.TICKET_SIGNING_SECRET,
      );
      await markTicketStubDownloaded(pool, order.id);
      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT venue, starts_at FROM events ORDER BY created_at ASC LIMIT 1",
      );
      const eventRow = eventRows[0];
      const rawStart = eventRow?.["starts_at"];
      const parsedStart =
        rawStart instanceof Date ? rawStart : rawStart ? new Date(String(rawStart)) : EVENT_STARTS_AT;
      const pdf = await ticketsPdf(tickets, {
        venue: typeof eventRow?.["venue"] === "string" ? eventRow["venue"] : EVENT_VENUE,
        startsAt: Number.isNaN(parsedStart.getTime()) ? EVENT_STARTS_AT : parsedStart,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="sherehe-tickets.pdf"',
      );
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  });

  r.get("/:id/receipt.pdf", requireUser, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params["id"]);
      if (!id.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid order id.",
        });
        return;
      }
      const order = await loadOwnedOrder(pool, user, id.data);
      if (!order) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Order not found.",
        });
        return;
      }
      if (order.kind !== "product" || order.status !== "paid") {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "The receipt is ready after M-Pesa confirms payment.",
        });
        return;
      }
      const [items] = await pool.query<RowDataPacket[]>(
        "SELECT title, qty FROM order_items WHERE order_id = ? LIMIT 1",
        [order.id],
      );
      const item = items[0] as { title: string; qty: number } | undefined;
      const [payRows] = await pool.query<RowDataPacket[]>(
        "SELECT receipt FROM payments WHERE order_id = ? AND status = 'succeeded' LIMIT 1",
        [order.id],
      );
      const pay = payRows[0] as { receipt: string | null } | undefined;
      const pdf = await productReceiptPdf({
        title: item?.title ?? "Plate",
        qty: Number(item?.qty ?? 1),
        totalKsh: order.total_ksh,
        holderName: stubHolderCaption({
          ticketCode: "regular",
          displayName: user.display_name,
          givenName: user.given_name,
          email: user.email,
        }),
        mpesaReceipt: pay?.receipt ?? null,
        paidAt: order.paid_at,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="sherehe-receipt.pdf"',
      );
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  });

  r.post("/:id/stk-query", requireUser, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params["id"]);
      if (!id.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid order id.",
        });
        return;
      }
      const order = await loadOwnedOrder(pool, user, id.data);
      if (!order) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Order not found.",
        });
        return;
      }
      if (order.status === "paid") {
        res.json({ status: "paid" });
        return;
      }
      if (order.status !== "pending") {
        res.json({ status: "failed" });
        return;
      }
      const [payRows] = await pool.query<RowDataPacket[]>(
        "SELECT checkout_request_id, status FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1",
        [order.id],
      );
      const pay = payRows[0] as PaymentRow | undefined;
      if (!pay) {
        res.json({ status: "pending" });
        return;
      }
      if (pay.status === "succeeded") {
        res.json({ status: "paid" });
        return;
      }
      const queried = await stk.query(pay.checkout_request_id);
      const status = await applyStkOutcome(
        pool,
        config,
        pay.checkout_request_id,
        queried.resultCode,
        queried.resultDesc.slice(0, 64) || null,
      );
      res.json({ status });
    } catch (err) {
      next(err);
    }
  });

  r.get("/:id", requireUser, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params["id"]);
      if (!id.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid order id.",
        });
        return;
      }
      const order = await loadOwnedOrder(pool, user, id.data);
      if (!order) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Order not found.",
        });
        return;
      }
      const [items] = await pool.query<RowDataPacket[]>(
        "SELECT sku_kind, sku_code, title, qty, unit_price_ksh, seats FROM order_items WHERE order_id = ?",
        [order.id],
      );
      const [payRows] = await pool.query<RowDataPacket[]>(
        "SELECT status, receipt FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1",
        [order.id],
      );
      const pay = payRows[0] as { status: string; receipt: string | null } | undefined;
      const tickets =
        order.status === "paid" && order.kind === "tickets"
          ? await ticketsForOrder(pool, order.id, config.TICKET_SIGNING_SECRET)
          : [];
      res.json({
        id: order.id,
        kind: order.kind,
        status: order.status,
        totalKsh: order.total_ksh,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        paymentStatus: pay?.status ?? null,
        mpesaReceipt: pay?.receipt ?? null,
        items,
        tickets,
      });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

export function mpesaCallbackRouter(pool: Pool, config: Config): Router {
  const r = Router();
  r.post("/mpesa/callback", async (req, res, next) => {
    try {
      const parsed = StkCallbackBody.safeParse(req.body);
      if (!parsed.success) {
        log("warn", "mpesa_callback_invalid", {});
        res.json({ ResultCode: 0, ResultDesc: "Accepted" });
        return;
      }
      const cb = parsed.data.Body.stkCallback;
      const receipt =
        cb.ResultCode === 0 ? receiptFromCallback(parsed.data) : null;
      await applyStkOutcome(
        pool,
        config,
        cb.CheckoutRequestID,
        String(cb.ResultCode),
        receipt,
      );
      res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (err) {
      next(err);
    }
  });
  return r;
}
