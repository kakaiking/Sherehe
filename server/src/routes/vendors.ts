import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "../db.js";
import type { Config } from "../config.js";
import type { StkClient } from "../mpesa/client.js";
import { requireUser } from "../auth/session.js";
import { fulfillPaidOrder } from "../sale/orders.js";
import { loadEventId } from "../sale/orders.js";
import { stkPhone, STK_PHONE_NEEDED } from "../phone.js";

const VendorBody = z.object({
  packageCode: z.string().min(1).max(32),
  category: z.string().min(1).max(80),
  companyName: z.string().min(1).max(200),
  notes: z.string().min(1).max(2000),
});

export function vendorsRouter(
  pool: Pool,
  config: Config,
  stk: StkClient,
): Router {
  const r = Router();

  r.get("/packages", async (_req, res, next) => {
    try {
      const eventId = await loadEventId(pool);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT code, name, category_hint, space_description, fee_ksh, setup_time, operating_hours, payment_deadline, rules
         FROM vendor_packages WHERE event_id = ?`,
        [eventId],
      );
      res.json({ packages: rows });
    } catch (err) {
      next(err);
    }
  });

  r.post("/apply", requireUser, async (req, res, next) => {
    try {
      const parsed = VendorBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Choose a package and fill company details.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      const eventId = await loadEventId(pool);
      const [pkgRows] = await pool.query<RowDataPacket[]>(
        "SELECT id, name, fee_ksh, payment_deadline FROM vendor_packages WHERE event_id = ? AND code = ?",
        [eventId, parsed.data.packageCode],
      );
      const pkg = pkgRows[0] as
        | { id: string; name: string; fee_ksh: number; payment_deadline: Date }
        | undefined;
      if (!pkg) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Unknown vendor package.",
        });
        return;
      }
      if (new Date() > new Date(pkg.payment_deadline)) {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "The vendor payment deadline has passed.",
        });
        return;
      }
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
      const orderId = randomUUID();
      const appId = randomUUID();
      await pool.query(
        `INSERT INTO orders (id, user_id, event_id, kind, status, total_ksh, hold_expires_at)
         VALUES (?, ?, ?, 'vendor', 'pending', ?, NOW() + INTERVAL '10 minutes')`,
        [orderId, user.id, eventId, pkg.fee_ksh],
      );
      await pool.query(
        `INSERT INTO order_items (id, order_id, sku_kind, sku_code, title, qty, unit_price_ksh, seats)
         VALUES (?, ?, 'vendor', ?, ?, 1, ?, 0)`,
        [randomUUID(), orderId, parsed.data.packageCode, pkg.name, pkg.fee_ksh],
      );
      await pool.query(
        `INSERT INTO vendor_applications
         (id, user_id, package_id, category, company_name, notes, status, order_id)
         VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?)`,
        [
          appId,
          user.id,
          pkg.id,
          parsed.data.category,
          parsed.data.companyName,
          parsed.data.notes,
          orderId,
        ],
      );
      const stkRes = await stk.push({
        phone: payPhone,
        amountKsh: pkg.fee_ksh,
        accountRef: orderId.replace(/-/g, "").slice(0, 12),
      });
      await pool.query(
        `INSERT INTO payments (id, order_id, provider, checkout_request_id, merchant_request_id, status)
         VALUES (?, ?, 'mpesa', ?, ?, 'pending')`,
        [randomUUID(), orderId, stkRes.checkoutRequestId, stkRes.merchantRequestId],
      );
      if (config.MPESA_MODE === "mock") {
        await pool.query(
          "UPDATE payments SET status = 'succeeded', result_code = '0', receipt = ? WHERE checkout_request_id = ?",
          [`MOCK${orderId.slice(0, 8)}`, stkRes.checkoutRequestId],
        );
        await fulfillPaidOrder(pool, orderId, config.TICKET_SIGNING_SECRET);
      }
      res.status(201).json({ applicationId: appId, orderId, totalKsh: pkg.fee_ksh });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
