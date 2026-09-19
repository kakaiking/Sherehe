import { Router } from "express";
import type { Pool, RowDataPacket } from "../db.js";
import { requireUser } from "../auth/session.js";
import { userHasDownloadedTicket } from "../sale/orders.js";

export function accountRouter(pool: Pool): Router {
  const r = Router();
  r.get("/ticket-pass", requireUser, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const hasTicket = await userHasDownloadedTicket(pool, user.id, user.kind);
      res.json({ hasTicket });
    } catch (err) {
      next(err);
    }
  });
  r.get("/orders", requireUser, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT o.id, o.kind, o.status, o.total_ksh, o.created_at, o.paid_at,
                oi.title, oi.sku_code, oi.qty
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = ? AND o.account_kind = ?
         ORDER BY o.created_at DESC, oi.id ASC
         LIMIT 50`,
        [user.id, user.kind],
      );
      res.json({
        orders: rows.map((row) => ({
          id: row["id"],
          kind: row["kind"],
          status: row["status"],
          total_ksh: row["total_ksh"],
          created_at: row["created_at"],
          occurred_at: row["paid_at"] ?? row["created_at"],
          title: row["title"] ?? row["kind"],
          sku_code: row["sku_code"] ?? null,
          qty: row["qty"] ?? 1,
        })),
      });
    } catch (err) {
      next(err);
    }
  });
  return r;
}
