import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import type { Pool, RowDataPacket, ResultHeader } from "../db.js";
import type { Config } from "../config.js";
import { requireStaff } from "../auth/session.js";
import {
  ORDER_BUYER_DISPLAY,
  ORDER_BUYER_EMAIL,
  ORDER_BUYER_GIVEN,
  ORDER_BUYER_JOINS,
  ORDER_BUYER_PHONE,
} from "../auth/accounts.js";
import { attendeeCount, loadEventId } from "../sale/orders.js";
import { ATTENDEE_TARGET } from "../sale/engine.js";
import { verifyTicketSignature } from "../tickets/hmac.js";
import { loadTicketPass } from "../tickets/passLookup.js";
import { ticketLabel } from "../tickets/label.js";
import { stubHolderCaption } from "../tickets/holder.js";

export function staffRouter(pool: Pool, config: Config): Router {
  const r = Router();
  r.use(requireStaff);

  r.get("/overview", async (_req, res, next) => {
    try {
      const eventId = await loadEventId(pool);
      const count = await attendeeCount(pool, eventId);
      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT name, venue, starts_at, flash_enabled, flash_ends_at FROM events WHERE id = ?",
        [eventId],
      );
      const event = eventRows[0];
      const [windows] = await pool.query<RowDataPacket[]>(
        "SELECT ticket_code, starts_at, ends_at FROM sale_windows WHERE event_id = ? ORDER BY starts_at",
        [eventId],
      );
      const [partners] = await pool.query<RowDataPacket[]>(
        `SELECT id, kind, company_name, contact_name, service_offered, member_count, status,
                ticket_order_id, created_at, reviewed_at,
                (logo_data IS NOT NULL) AS has_logo,
                (contract_data IS NOT NULL) AS has_contract
         FROM partner_applications
         ORDER BY
           CASE status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
           created_at DESC
         LIMIT 100`,
      );
      const [vendors] = await pool.query<RowDataPacket[]>(
        `SELECT v.id,
                COALESCE(va.company_name, v.display_name, v.email) AS company_name,
                va.category,
                va.status,
                p.name AS package_name,
                p.fee_ksh,
                va.id AS application_id
         FROM vendors v
         LEFT JOIN LATERAL (
           SELECT id, company_name, category, status, package_id, created_at
           FROM vendor_applications
           WHERE vendor_id = v.id
           ORDER BY created_at DESC
           LIMIT 1
         ) va ON TRUE
         LEFT JOIN vendor_packages p ON p.id = va.package_id
         ORDER BY
           CASE va.status
             WHEN 'pending' THEN 0
             WHEN 'awaiting_payment' THEN 1
             WHEN 'paid' THEN 2
             ELSE 3
           END,
           COALESCE(va.created_at, v.created_at) DESC
         LIMIT 100`,
      );
      const [products] = await pool.query<RowDataPacket[]>(
        "SELECT slug, name, stock, price_ksh FROM products",
      );
      const [ticketStats] = await pool.query<RowDataPacket[]>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'paid') AS paid_orders,
           COALESCE(SUM(total_ksh) FILTER (WHERE status = 'paid'), 0) AS revenue_ksh
         FROM orders
         WHERE kind = 'tickets' AND event_id = ?`,
        [eventId],
      );
      const [ticketBuyers] = await pool.query<RowDataPacket[]>(
        `SELECT o.id,
                o.total_ksh,
                o.paid_at,
                o.created_at,
                ${ORDER_BUYER_DISPLAY} AS display_name,
                ${ORDER_BUYER_EMAIL} AS email,
                ${ORDER_BUYER_PHONE} AS phone,
                COALESCE((
                  SELECT SUM(oi.seats) FROM order_items oi WHERE oi.order_id = o.id
                ), 0) AS seats,
                COALESCE((
                  SELECT SUM(oi.qty) FROM order_items oi WHERE oi.order_id = o.id
                ), 0) AS qty
         FROM orders o
         ${ORDER_BUYER_JOINS}
         WHERE o.kind = 'tickets' AND o.status = 'paid' AND o.event_id = ?
         ORDER BY COALESCE(o.paid_at, o.created_at) DESC
         LIMIT 200`,
        [eventId],
      );
      const stats = ticketStats[0] as
        | { paid_orders: number; revenue_ksh: number }
        | undefined;
      const pendingPartners = partners.filter((p) => p["status"] === "pending").length;
      const pendingVendors = vendors.filter(
        (v) => v["status"] === "pending" || v["status"] === "awaiting_payment",
      ).length;

      res.json({
        eventName: event?.["name"],
        venue: event?.["venue"] ?? null,
        startsAt: event?.["starts_at"] ?? null,
        attendeeCount: count,
        attendeeTarget: ATTENDEE_TARGET,
        flashEnabled: Boolean(event?.["flash_enabled"]),
        flashEndsAt: event?.["flash_ends_at"] ?? null,
        canArmFlash: count < ATTENDEE_TARGET,
        windows,
        partners: partners.map((p) => ({
          id: p["id"],
          kind: p["kind"],
          company_name: p["company_name"],
          contact_name: p["contact_name"],
          service_offered: p["service_offered"] ?? "",
          member_count: Number(p["member_count"]),
          status: p["status"],
          ticket_order_id: p["ticket_order_id"] ?? null,
          claimed: Boolean(p["ticket_order_id"]),
          has_logo: Boolean(p["has_logo"]),
          has_contract: Boolean(p["has_contract"]),
          created_at: p["created_at"],
          reviewed_at: p["reviewed_at"] ?? null,
        })),
        vendors: vendors.map((v) => ({
          id: v["id"],
          company_name: v["company_name"],
          category: v["category"] ?? null,
          status: v["status"] ?? "registered",
          package_name: v["package_name"] ?? null,
          fee_ksh: v["fee_ksh"] != null ? Number(v["fee_ksh"]) : null,
          application_id: v["application_id"] ?? null,
        })),
        products,
        ticketBuyers: ticketBuyers.map((b) => ({
          id: b["id"],
          display_name: b["display_name"] ?? null,
          email: b["email"] ?? null,
          phone: b["phone"] ?? null,
          total_ksh: Number(b["total_ksh"] ?? 0),
          seats: Number(b["seats"] ?? 0),
          qty: Number(b["qty"] ?? 0),
          paid_at: b["paid_at"] ?? b["created_at"] ?? null,
        })),
        overview: {
          pendingPartners,
          pendingVendors,
          attendeeCount: count,
          attendeeTarget: ATTENDEE_TARGET,
          paidTicketOrders: Number(stats?.paid_orders ?? 0),
          ticketRevenueKsh: Number(stats?.revenue_ksh ?? 0),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/vendors/:id", async (req, res, next) => {
    try {
      const id = z.string().uuid().safeParse(req.params["id"]);
      if (!id.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid vendor id.",
        });
        return;
      }
      const [vendorRows] = await pool.query<RowDataPacket[]>(
        `SELECT v.id, v.email, v.display_name, v.phone,
                COALESCE(va.company_name, v.display_name, v.email) AS company_name,
                va.category, va.status AS application_status, va.order_id,
                p.name AS package_name, p.fee_ksh
         FROM vendors v
         LEFT JOIN LATERAL (
           SELECT company_name, category, status, order_id, package_id, created_at
           FROM vendor_applications
           WHERE vendor_id = v.id
           ORDER BY created_at DESC
           LIMIT 1
         ) va ON TRUE
         LEFT JOIN vendor_packages p ON p.id = va.package_id
         WHERE v.id = ?`,
        [id.data],
      );
      const vendor = vendorRows[0];
      if (!vendor) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Vendor not found.",
        });
        return;
      }

      let packagePaidKsh = 0;
      let packageOrderStatus: string | null = null;
      if (vendor["order_id"]) {
        const [orderRows] = await pool.query<RowDataPacket[]>(
          "SELECT status, total_ksh FROM orders WHERE id = ?",
          [vendor["order_id"]],
        );
        const order = orderRows[0] as
          | { status: string; total_ksh: number }
          | undefined;
        if (order) {
          packageOrderStatus = order.status;
          if (order.status === "paid") packagePaidKsh = Number(order.total_ksh);
        }
      }

      const [productRows] = await pool.query<RowDataPacket[]>(
        `SELECT p.slug, p.name, p.stock, p.price_ksh,
                COALESCE(s.units_sold, 0) AS units_sold,
                COALESCE(s.sales_ksh, 0) AS sales_ksh
         FROM products p
         LEFT JOIN (
           SELECT oi.sku_code,
                  SUM(oi.qty) AS units_sold,
                  SUM(oi.qty * oi.unit_price_ksh) AS sales_ksh
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE oi.sku_kind = 'product' AND o.status = 'paid'
           GROUP BY oi.sku_code
         ) s ON s.sku_code = p.slug
         WHERE p.owner_id = ?
         ORDER BY p.name`,
        [id.data],
      );
      const products = productRows.map((p) => ({
        slug: String(p["slug"]),
        name: String(p["name"]),
        stock: Number(p["stock"] ?? 0),
        price_ksh: Number(p["price_ksh"] ?? 0),
        units_sold: Number(p["units_sold"] ?? 0),
        sales_ksh: Number(p["sales_ksh"] ?? 0),
      }));
      const productSalesKsh = products.reduce((sum, p) => sum + p.sales_ksh, 0);

      res.json({
        id: vendor["id"],
        company_name: vendor["company_name"],
        email: vendor["email"],
        phone: vendor["phone"] ?? null,
        category: vendor["category"] ?? null,
        application_status: vendor["application_status"] ?? "registered",
        package_name: vendor["package_name"] ?? null,
        package_fee_ksh:
          vendor["fee_ksh"] != null ? Number(vendor["fee_ksh"]) : null,
        standing: {
          package_paid_ksh: packagePaidKsh,
          package_order_status: packageOrderStatus,
          product_sales_ksh: productSalesKsh,
          money_received_ksh: packagePaidKsh + productSalesKsh,
        },
        products,
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/flash", async (req, res, next) => {
    try {
      const body = z
        .object({
          enabled: z.boolean(),
          endsAt: z.string().min(1).max(40).optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Send enabled and an optional end time.",
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const count = await attendeeCount(pool, eventId);
      if (body.data.enabled && count >= ATTENDEE_TARGET) {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "Target of 200 attendees already reached. No flash sale.",
        });
        return;
      }
      const ends = body.data.endsAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await pool.query(
        "UPDATE events SET flash_enabled = ?, flash_ends_at = ? WHERE id = ?",
        [body.data.enabled ? 1 : 0, body.data.enabled ? new Date(ends) : null, eventId],
      );
      res.json({ flashEnabled: body.data.enabled, flashEndsAt: body.data.enabled ? ends : null });
    } catch (err) {
      next(err);
    }
  });

  r.post("/partners/:id/review", async (req, res, next) => {
    try {
      const id = z.string().uuid().safeParse(req.params["id"]);
      const body = z.object({ status: z.enum(["confirmed", "rejected"]) }).safeParse(req.body);
      if (!id.success || !body.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid review payload.",
        });
        return;
      }
      await pool.query(
        "UPDATE partner_applications SET status = ?, reviewed_at = NOW() WHERE id = ?",
        [body.data.status, id.data],
      );
      res.json({ id: id.data, status: body.data.status });
    } catch (err) {
      next(err);
    }
  });

  r.get("/partners/:id/logo", async (req, res, next) => {
    try {
      await sendPartnerAsset(pool, req, res, "logo");
    } catch (err) {
      next(err);
    }
  });

  r.get("/partners/:id/contract", async (req, res, next) => {
    try {
      await sendPartnerAsset(pool, req, res, "contract");
    } catch (err) {
      next(err);
    }
  });

  r.get("/tickets/scans", async (_req, res, next) => {
    try {
      const eventId = await loadEventId(pool);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT t.public_id, t.ticket_code, t.used_at,
                ${ORDER_BUYER_DISPLAY} AS display_name,
                ${ORDER_BUYER_GIVEN} AS given_name,
                ${ORDER_BUYER_EMAIL} AS email
         FROM tickets t
         JOIN orders o ON o.id = t.order_id
         ${ORDER_BUYER_JOINS}
         WHERE t.event_id = ? AND t.status = 'used' AND t.used_at IS NOT NULL
         ORDER BY t.used_at DESC
         LIMIT 100`,
        [eventId],
      );
      res.json({
        scans: (
          rows as Array<{
            public_id: string;
            ticket_code: string;
            used_at: Date | string;
            display_name: string | null;
            given_name: string | null;
            email: string;
          }>
        ).map((row) => ({
          publicId: row.public_id,
          code: row.ticket_code,
          label: ticketLabel(row.ticket_code),
          holderName: stubHolderCaption({
            ticketCode: row.ticket_code,
            displayName: row.display_name,
            givenName: row.given_name,
            email: row.email,
          }),
          usedAt: new Date(row.used_at).toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/tickets/scan", async (req, res, next) => {
    try {
      const body = z
        .object({
          publicId: z.string().length(32),
          signature: z.string().length(64),
        })
        .safeParse(req.body);
      if (!body.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Scan payload is invalid.",
        });
        return;
      }
      if (
        !verifyTicketSignature(
          body.data.publicId,
          body.data.signature,
          config.TICKET_SIGNING_SECRET,
        )
      ) {
        res.status(400).json({
          type: "https://httpstatuses.com/400",
          title: "Bad Request",
          status: 400,
          detail: "Ticket signature does not match.",
          outcome: "invalid",
        });
        return;
      }
      const pass = await loadTicketPass(pool, body.data.publicId);
      if (!pass) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Ticket not found.",
          outcome: "invalid",
        });
        return;
      }
      if (pass.status === "void") {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "This ticket is void.",
          outcome: "void",
          publicId: pass.publicId,
          code: pass.code,
          label: pass.label,
          holderName: pass.holderName,
          eventName: pass.eventName,
          statusTicket: pass.status,
        });
        return;
      }
      if (pass.status === "used") {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "This ticket was already scanned.",
          outcome: "already_used",
          publicId: pass.publicId,
          code: pass.code,
          label: pass.label,
          holderName: pass.holderName,
          eventName: pass.eventName,
          usedAt: pass.usedAt,
          statusTicket: pass.status,
        });
        return;
      }
      const [update] = await pool.query<ResultHeader>(
        "UPDATE tickets SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'issued'",
        [pass.id],
      );
      if (update.affectedRows !== 1) {
        const again = await loadTicketPass(pool, body.data.publicId);
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "This ticket was already scanned.",
          outcome: "already_used",
          publicId: again?.publicId ?? pass.publicId,
          code: again?.code ?? pass.code,
          label: again?.label ?? pass.label,
          holderName: again?.holderName ?? pass.holderName,
          eventName: again?.eventName ?? pass.eventName,
          usedAt: again?.usedAt ?? null,
          statusTicket: again?.status ?? "used",
        });
        return;
      }
      const admitted = await loadTicketPass(pool, body.data.publicId);
      res.json({
        outcome: "admitted",
        status: "used",
        publicId: pass.publicId,
        code: pass.code,
        label: pass.label,
        holderName: pass.holderName,
        eventName: pass.eventName,
        usedAt: admitted?.usedAt ?? new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

async function sendPartnerAsset(
  pool: Pool,
  req: Request,
  res: Response,
  kind: "logo" | "contract",
): Promise<void> {
  const id = z.string().uuid().safeParse(req.params["id"]);
  if (!id.success) {
    res.status(422).json({
      type: "https://httpstatuses.com/422",
      title: "Unprocessable Entity",
      status: 422,
      detail: "Invalid partner application id.",
    });
    return;
  }
  const mimeCol = kind === "logo" ? "logo_mime" : "contract_mime";
  const dataCol = kind === "logo" ? "logo_data" : "contract_data";
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${mimeCol} AS mime, ${dataCol} AS data FROM partner_applications WHERE id = ?`,
    [id.data],
  );
  const row = rows[0] as { mime: string | null; data: Buffer | null } | undefined;
  if (!row?.mime || !row.data) {
    res.status(404).json({
      type: "https://httpstatuses.com/404",
      title: "Not Found",
      status: 404,
      detail: kind === "logo" ? "Logo not found." : "Contract not found.",
    });
    return;
  }
  const bytes = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  const filename =
    kind === "logo"
      ? `partner-logo.${extForMime(row.mime)}`
      : "partner-terms.pdf";
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, max-age=60");
  res.send(bytes);
}

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
