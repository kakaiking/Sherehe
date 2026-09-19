import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "../db.js";
import type { Config } from "../config.js";
import type { StkClient } from "../mpesa/client.js";
import { requireUser, requireVendor } from "../auth/session.js";
import { fulfillPaidOrder, loadEventId } from "../sale/orders.js";
import { stkPhone, STK_PHONE_NEEDED } from "../phone.js";
import {
  clampShopPage,
  productSlug,
  SHOP_PAGE_SIZE,
  shopOffset,
  shopPageCount,
} from "../shop/paging.js";

const BookBody = z.object({
  slug: z.string().min(1).max(64),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pax: z.number().int().min(1).max(5000),
  notes: z.string().min(1).max(2000),
});

const ShopBody = z.object({
  slug: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(20),
});

const ProductBody = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000),
  price_ksh: z.number().int().min(50).max(200000),
  stock: z.number().int().min(0).max(100000),
});

const ProductPatch = ProductBody.partial();

const SlugParam = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/);

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional(),
});

export function commerceRouter(
  pool: Pool,
  config: Config,
  stk: StkClient,
): Router {
  const r = Router();

  r.get("/services", async (_req, res, next) => {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT slug, name, category, description, price_ksh FROM service_offerings ORDER BY name",
      );
      res.json({ offerings: rows });
    } catch (err) {
      next(err);
    }
  });

  r.get("/products", async (req, res, next) => {
    try {
      const parsed = PageQuery.safeParse(req.query);
      const requested = parsed.success ? (parsed.data.page ?? 1) : 1;
      const vendor = req.user?.role === "vendor" ? req.user : null;
      const where = vendor ? "WHERE owner_id = ?" : "";
      const countParams = vendor ? [vendor.id] : [];
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM products ${where}`,
        countParams,
      );
      const total = Number(countRows[0]?.["n"] ?? 0);
      const page = clampShopPage(requested, total);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT slug, name, description, price_ksh, stock FROM products ${where}
         ORDER BY name LIMIT ? OFFSET ?`,
        vendor ? [vendor.id, SHOP_PAGE_SIZE, shopOffset(page)] : [SHOP_PAGE_SIZE, shopOffset(page)],
      );
      res.json({
        products: rows,
        page,
        pageSize: SHOP_PAGE_SIZE,
        total,
        pages: shopPageCount(total),
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/products", requireVendor, async (req, res, next) => {
    try {
      const parsed = ProductBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Name, description, price, and stock are required.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      const id = randomUUID();
      const slug = productSlug(parsed.data.name, id);
      await pool.query(
        `INSERT INTO products (id, slug, name, description, price_ksh, stock, owner_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          slug,
          parsed.data.name,
          parsed.data.description,
          parsed.data.price_ksh,
          parsed.data.stock,
          user.id,
        ],
      );
      res.status(201).json({
        slug,
        name: parsed.data.name,
        description: parsed.data.description,
        price_ksh: parsed.data.price_ksh,
        stock: parsed.data.stock,
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/products/:slug/sales", requireVendor, async (req, res, next) => {
    try {
      const slug = SlugParam.safeParse(req.params["slug"]);
      if (!slug.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Unknown plate.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      const [prodRows] = await pool.query<RowDataPacket[]>(
        "SELECT id, slug, name, description, price_ksh, stock FROM products WHERE slug = ? AND owner_id = ?",
        [slug.data, user.id],
      );
      const product = prodRows[0];
      if (!product) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Unknown plate.",
        });
        return;
      }
      const [sales] = await pool.query<RowDataPacket[]>(
        `SELECT o.id AS order_id, o.status, o.total_ksh, o.paid_at, o.created_at,
                oi.qty, oi.unit_price_ksh,
                u.display_name, u.email, u.phone,
                pay.receipt
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN users u ON u.id = o.user_id
         LEFT JOIN payments pay ON pay.order_id = o.id AND pay.status = 'succeeded'
         WHERE oi.sku_kind = 'product' AND oi.sku_code = ?
         ORDER BY COALESCE(o.paid_at, o.created_at) DESC
         LIMIT 100`,
        [slug.data],
      );
      res.json({ product, sales });
    } catch (err) {
      next(err);
    }
  });

  r.patch("/products/:slug", requireVendor, async (req, res, next) => {
    try {
      const slug = SlugParam.safeParse(req.params["slug"]);
      const parsed = ProductPatch.safeParse(req.body);
      if (!slug.success || !parsed.success || Object.keys(parsed.data).length === 0) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Send a name, description, price, or stock to update.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      const fields: string[] = [];
      const values: unknown[] = [];
      if (parsed.data.name !== undefined) {
        fields.push("name = ?");
        values.push(parsed.data.name);
      }
      if (parsed.data.description !== undefined) {
        fields.push("description = ?");
        values.push(parsed.data.description);
      }
      if (parsed.data.price_ksh !== undefined) {
        fields.push("price_ksh = ?");
        values.push(parsed.data.price_ksh);
      }
      if (parsed.data.stock !== undefined) {
        fields.push("stock = ?");
        values.push(parsed.data.stock);
      }
      values.push(slug.data, user.id);
      const [result] = await pool.query(
        `UPDATE products SET ${fields.join(", ")} WHERE slug = ? AND owner_id = ?`,
        values,
      );
      const changed = (result as { affectedRows?: number }).affectedRows ?? 0;
      if (changed === 0) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Unknown plate.",
        });
        return;
      }
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT slug, name, description, price_ksh, stock FROM products WHERE slug = ?",
        [slug.data],
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  r.delete("/products/:slug", requireVendor, async (req, res, next) => {
    try {
      const slug = SlugParam.safeParse(req.params["slug"]);
      if (!slug.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Unknown plate.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      const [sold] = await pool.query<RowDataPacket[]>(
        `SELECT o.id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.slug = oi.sku_code
         WHERE oi.sku_kind = 'product' AND oi.sku_code = ? AND p.owner_id = ?
           AND o.status IN ('paid', 'pending')
         LIMIT 1`,
        [slug.data, user.id],
      );
      if (sold.length > 0) {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "This plate has orders. Edit stock instead of deleting it.",
        });
        return;
      }
      const [result] = await pool.query(
        "DELETE FROM products WHERE slug = ? AND owner_id = ?",
        [slug.data, user.id],
      );
      const changed = (result as { affectedRows?: number }).affectedRows ?? 0;
      if (changed === 0) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Unknown plate.",
        });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  r.post("/services/book", requireUser, async (req, res, next) => {
    try {
      const parsed = BookBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Choose a service, date, and guest count.",
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
      const [offRows] = await pool.query<RowDataPacket[]>(
        "SELECT id, name, price_ksh FROM service_offerings WHERE slug = ?",
        [parsed.data.slug],
      );
      const off = offRows[0] as { id: string; name: string; price_ksh: number } | undefined;
      if (!off) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Unknown service.",
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const orderId = randomUUID();
      const bookingId = randomUUID();
      await pool.query(
        `INSERT INTO orders (id, user_id, event_id, kind, status, total_ksh, hold_expires_at)
         VALUES (?, ?, ?, 'service', 'pending', ?, NOW() + INTERVAL '10 minutes')`,
        [orderId, user.id, eventId, off.price_ksh],
      );
      await pool.query(
        `INSERT INTO order_items (id, order_id, sku_kind, sku_code, title, qty, unit_price_ksh, seats)
         VALUES (?, ?, 'service', ?, ?, 1, ?, 0)`,
        [randomUUID(), orderId, parsed.data.slug, off.name, off.price_ksh],
      );
      await pool.query(
        `INSERT INTO service_bookings (id, user_id, offering_id, event_date, pax, notes, status, order_id)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          bookingId,
          user.id,
          off.id,
          parsed.data.eventDate,
          parsed.data.pax,
          parsed.data.notes,
          orderId,
        ],
      );
      const stkRes = await startPay(pool, stk, config, payPhone, orderId, off.price_ksh);
      res.status(201).json({ bookingId, orderId, totalKsh: off.price_ksh, payment: stkRes });
    } catch (err) {
      next(err);
    }
  });

  r.post("/products/buy", requireUser, async (req, res, next) => {
    try {
      const parsed = ShopBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Choose a product and quantity.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      if (user.role === "vendor") {
        res.status(403).json({
          type: "https://httpstatuses.com/403",
          title: "Forbidden",
          status: 403,
          detail: "The stall shop lists your plates. Guests and partners buy from the other gates.",
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
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [prodRows] = await conn.query<RowDataPacket[]>(
          "SELECT id, name, price_ksh, stock FROM products WHERE slug = ? FOR UPDATE",
          [parsed.data.slug],
        );
        const prod = prodRows[0] as
          | { id: string; name: string; price_ksh: number; stock: number }
          | undefined;
        if (!prod) {
          await conn.rollback();
          res.status(404).json({
            type: "https://httpstatuses.com/404",
            title: "Not Found",
            status: 404,
            detail: "Unknown product.",
          });
          return;
        }
        if (prod.stock < parsed.data.qty) {
          await conn.rollback();
          res.status(409).json({
            type: "https://httpstatuses.com/409",
            title: "Conflict",
            status: 409,
            detail: "Not enough stock. Reduce quantity and try again.",
          });
          return;
        }
        await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [
          parsed.data.qty,
          prod.id,
        ]);
        const eventId = await loadEventId(conn);
        const orderId = randomUUID();
        const total = prod.price_ksh * parsed.data.qty;
        await conn.query(
          `INSERT INTO orders (id, user_id, event_id, kind, status, total_ksh, hold_expires_at)
           VALUES (?, ?, ?, 'product', 'pending', ?, NOW() + INTERVAL '10 minutes')`,
          [orderId, user.id, eventId, total],
        );
        await conn.query(
          `INSERT INTO order_items (id, order_id, sku_kind, sku_code, title, qty, unit_price_ksh, seats)
           VALUES (?, ?, 'product', ?, ?, ?, ?, 0)`,
          [randomUUID(), orderId, parsed.data.slug, prod.name, parsed.data.qty, prod.price_ksh],
        );
        await conn.commit();
        const stkRes = await startPay(pool, stk, config, payPhone, orderId, total);
        res.status(201).json({ orderId, totalKsh: total, payment: stkRes });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  });

  return r;
}

async function startPay(
  pool: Pool,
  stk: StkClient,
  config: Config,
  phone: string,
  orderId: string,
  amountKsh: number,
): Promise<{ mode: string; checkoutRequestId: string }> {
  const stkRes = await stk.push({
    phone,
    amountKsh,
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
  return { mode: config.MPESA_MODE, checkoutRequestId: stkRes.checkoutRequestId };
}
