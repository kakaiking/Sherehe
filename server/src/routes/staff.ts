import type { Request, Response } from "express";
import { Router } from "express";
import { randomUUID } from "node:crypto";
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
import {
  mapEventPartner,
  reorderMismatchDetail,
  type EventPartnerRow,
} from "../eventPartners.js";
import { normalizeKenyanPhone } from "../phone.js";
import { decodeUpload } from "../partners/uploads.js";
import { attendeeCount, loadEventId, refundPaidTicketOrder } from "../sale/orders.js";
import {
  ATTENDEE_TARGET,
  assertCapacityPool,
  TICKET_CODES,
  type TicketCode,
} from "../sale/engine.js";
import {
  flashWindowFromDates,
  isDateStr,
  isFlashDateAllowed,
  normalizeFlashDates,
} from "../sale/flashDates.js";
import { verifyTicketSignature } from "../tickets/hmac.js";
import { loadTicketPass } from "../tickets/passLookup.js";
import { ticketLabel } from "../tickets/label.js";
import { stubHolderCaption } from "../tickets/holder.js";
import { log } from "../log.js";

const UploadPart = z.object({
  mime: z.string().min(3).max(64),
  data: z.string().min(8).max(3_500_000),
});

const EventPartnerCreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  phone: z.string().min(1).max(24),
  email: z.string().trim().email().max(255),
  logo: UploadPart,
});

const EventPartnerPatchBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    phone: z.string().min(1).max(24).optional(),
    email: z.string().trim().email().max(255).optional(),
    logo: UploadPart.optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.description !== undefined ||
      b.phone !== undefined ||
      b.email !== undefined ||
      b.logo !== undefined,
    { message: "empty" },
  );

export function staffRouter(pool: Pool, config: Config): Router {
  const r = Router();
  r.use(requireStaff);

  r.get("/overview", async (_req, res, next) => {
    try {
      const eventId = await loadEventId(pool);
      const count = await attendeeCount(pool, eventId);
      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT name, venue, starts_at, flash_enabled, flash_starts_at, flash_ends_at, flash_dates FROM events WHERE id = ?",
        [eventId],
      );
      const event = eventRows[0];
      const [windows] = await pool.query<RowDataPacket[]>(
        "SELECT ticket_code, starts_at, ends_at FROM sale_windows WHERE event_id = ? ORDER BY starts_at",
        [eventId],
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
      const [ticketTypeRows] = await pool.query<RowDataPacket[]>(
        `SELECT tt.code, tt.name, tt.price_ksh, tt.capacity, tt.sort_order,
                COALESCE(s.sold, 0) AS sold
         FROM ticket_types tt
         LEFT JOIN (
           SELECT oi.sku_code,
                  SUM(oi.qty) AS sold
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.event_id = ?
             AND o.kind = 'tickets'
             AND o.status = 'paid'
             AND oi.sku_kind = 'ticket'
           GROUP BY oi.sku_code
         ) s ON s.sku_code = tt.code
         WHERE tt.event_id = ?
         ORDER BY tt.sort_order, tt.code`,
        [eventId, eventId],
      );
      const stats = ticketStats[0] as
        | { paid_orders: number; revenue_ksh: number }
        | undefined;
      const [partnerCountRows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*)::int AS n FROM event_partners WHERE event_id = ?",
        [eventId],
      );
      const partnerCount = Number(partnerCountRows[0]?.["n"] ?? 0);

      res.json({
        eventName: event?.["name"],
        venue: event?.["venue"] ?? null,
        startsAt: event?.["starts_at"] ?? null,
        attendeeCount: count,
        attendeeTarget: ATTENDEE_TARGET,
        flashEnabled: Boolean(event?.["flash_enabled"]),
        flashStartsAt: event?.["flash_starts_at"] ?? null,
        flashEndsAt: event?.["flash_ends_at"] ?? null,
        flashDates: normalizeFlashDates(event?.["flash_dates"]),
        canArmFlash: count < ATTENDEE_TARGET,
        windows,
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
        ticketTypes: ticketTypeRows.map((t) => ({
          code: String(t["code"]),
          name: String(t["name"]),
          priceKsh: Number(t["price_ksh"] ?? 0),
          capacity: t["capacity"] != null ? Number(t["capacity"]) : null,
          sold: Number(t["sold"] ?? 0),
        })),
        overview: {
          attendeeCount: count,
          attendeeTarget: ATTENDEE_TARGET,
          paidTicketOrders: Number(stats?.paid_orders ?? 0),
          ticketRevenueKsh: Number(stats?.revenue_ksh ?? 0),
          partnerCount,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/orders/:id/refund", async (req, res, next) => {
    try {
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
      let result;
      try {
        result = await refundPaidTicketOrder(pool, id.data);
      } catch (err) {
        const name = (err as Error).message;
        const mapped: Record<string, { status: number; detail: string }> = {
          order_not_found: { status: 404, detail: "Order not found." },
          already_refunded: { status: 409, detail: "That order is already refunded." },
          order_not_paid: {
            status: 409,
            detail: "Only paid ticket orders can be refunded.",
          },
          ticket_already_used: {
            status: 409,
            detail: "A ticket on this order was already scanned. Refund blocked.",
          },
        };
        const hit = mapped[name];
        if (hit) {
          res.status(hit.status).json({
            type: `https://httpstatuses.com/${hit.status}`,
            title: hit.status === 404 ? "Not Found" : "Conflict",
            status: hit.status,
            detail: hit.detail,
          });
          return;
        }
        throw err;
      }
      // STK credentials alone cannot reverse M-Pesa; ops reverse in Daraja with the receipt.
      if (config.PAYMENT_PROVIDER !== "mock") {
        log("info", "refund_mpesa_manual", {
          orderId: id.data.slice(0, 8),
          receipt: result.receipt ? String(result.receipt).slice(0, 16) : null,
          totalKsh: result.totalKsh,
          staffId: req.user?.id.slice(0, 8) ?? null,
        });
      } else {
        log("info", "refund_mock", {
          orderId: id.data.slice(0, 8),
          ticketsVoided: result.ticketsVoided,
        });
      }
      res.json({
        refunded: true,
        ticketsVoided: result.ticketsVoided,
        totalKsh: result.totalKsh,
        mpesa:
          config.PAYMENT_PROVIDER === "paystack"
            ? "manual_paystack_refund"
            : config.PAYMENT_PROVIDER === "daraja"
              ? "manual_daraja_reverse"
              : "local_mock",
        receipt: result.receipt,
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/flash", async (req, res, next) => {
    try {
      const body = z
        .object({
          dates: z.array(z.string().min(8).max(12)).max(366),
        })
        .safeParse(req.body);
      if (!body.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Send a dates array of YYYY-MM-DD values.",
        });
        return;
      }
      const dates = normalizeFlashDates(body.data.dates);
      if (body.data.dates.some((d) => !isDateStr(String(d).trim()))) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Each flash date must be a valid YYYY-MM-DD calendar day.",
        });
        return;
      }
      if (dates.some((d) => !isFlashDateAllowed(d))) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail:
            "Flash days must be today through the event night (28 Nov 2026).",
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const count = await attendeeCount(pool, eventId);
      if (dates.length > 0 && count >= ATTENDEE_TARGET) {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "Target of 200 attendees already reached. No flash sale.",
        });
        return;
      }
      const window = flashWindowFromDates(dates);
      await pool.query(
        `UPDATE events
         SET flash_enabled = ?, flash_dates = ?::jsonb, flash_starts_at = ?, flash_ends_at = ?
         WHERE id = ?`,
        [
          dates.length > 0 ? 1 : 0,
          JSON.stringify(dates),
          window.startsAt,
          window.endsAt,
          eventId,
        ],
      );
      res.json({
        flashEnabled: dates.length > 0,
        flashDates: dates,
        flashStartsAt: window.startsAt?.toISOString() ?? null,
        flashEndsAt: window.endsAt?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  r.patch("/ticket-types", async (req, res, next) => {
    try {
      const capacitySchema = z.number().int().min(0).max(100_000);
      const body = z
        .object({
          capacities: z.record(z.string(), capacitySchema),
        })
        .safeParse(req.body);
      if (!body.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Send capacities for every ticket type.",
        });
        return;
      }
      const raw = body.data.capacities;
      const capacities: Partial<Record<TicketCode, number>> = {};
      for (const code of TICKET_CODES) {
        const value = raw[code];
        if (value === undefined) {
          res.status(422).json({
            type: "https://httpstatuses.com/422",
            title: "Unprocessable Entity",
            status: 422,
            detail: `Missing capacity for ${code}.`,
          });
          return;
        }
        capacities[code] = value;
      }
      for (const key of Object.keys(raw)) {
        if (!TICKET_CODES.includes(key as TicketCode)) {
          res.status(422).json({
            type: "https://httpstatuses.com/422",
            title: "Unprocessable Entity",
            status: 422,
            detail: `Unknown ticket code ${key}.`,
          });
          return;
        }
      }
      const poolCheck = assertCapacityPool(capacities);
      if (!poolCheck.ok) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: poolCheck.detail,
        });
        return;
      }

      const eventId = await loadEventId(pool);
      const [soldRows] = await pool.query<RowDataPacket[]>(
        `SELECT oi.sku_code AS code, COALESCE(SUM(oi.qty), 0) AS sold
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.event_id = ?
           AND o.kind = 'tickets'
           AND o.status = 'paid'
           AND oi.sku_kind = 'ticket'
         GROUP BY oi.sku_code`,
        [eventId],
      );
      const soldByCode: Partial<Record<TicketCode, number>> = {};
      for (const row of soldRows as Array<{ code: string; sold: number }>) {
        soldByCode[row.code as TicketCode] = Number(row.sold);
      }
      for (const code of TICKET_CODES) {
        const sold = soldByCode[code] ?? 0;
        const capacity = capacities[code]!;
        if (capacity < sold) {
          res.status(409).json({
            type: "https://httpstatuses.com/409",
            title: "Conflict",
            status: 409,
            detail: `Capacity for ${code} cannot be below ${sold} already sold.`,
          });
          return;
        }
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const code of TICKET_CODES) {
          const [update] = await conn.query<ResultHeader>(
            "UPDATE ticket_types SET capacity = ? WHERE event_id = ? AND code = ?",
            [capacities[code], eventId, code],
          );
          if (update.affectedRows !== 1) {
            await conn.rollback();
            res.status(404).json({
              type: "https://httpstatuses.com/404",
              title: "Not Found",
              status: 404,
              detail: `Ticket type ${code} not found.`,
            });
            return;
          }
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      res.json({ capacities, sum: poolCheck.sum });
    } catch (err) {
      next(err);
    }
  });

  r.patch("/ticket-types/:code", async (req, res, next) => {
    try {
      const code = z
        .enum(["early_bird", "rush", "regular", "vip", "viip", "group", "flash", "test"])
        .safeParse(req.params["code"]);
      const body = z
        .object({
          capacity: z.number().int().min(0).max(100_000),
        })
        .safeParse(req.body);
      if (!code.success || !body.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Send a valid ticket code and a non-negative capacity.",
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const [soldRows] = await pool.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(oi.qty), 0) AS sold
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.event_id = ?
           AND o.kind = 'tickets'
           AND o.status = 'paid'
           AND oi.sku_kind = 'ticket'
           AND oi.sku_code = ?`,
        [eventId, code.data],
      );
      const sold = Number((soldRows[0] as { sold: number } | undefined)?.sold ?? 0);
      if (body.data.capacity < sold) {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: `Capacity cannot be below ${sold} already sold.`,
        });
        return;
      }
      const [update] = await pool.query<ResultHeader>(
        "UPDATE ticket_types SET capacity = ? WHERE event_id = ? AND code = ?",
        [body.data.capacity, eventId, code.data],
      );
      if (update.affectedRows !== 1) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Ticket type not found.",
        });
        return;
      }
      res.json({ code: code.data, capacity: body.data.capacity, sold });
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

  r.get("/event-partners", async (_req, res, next) => {
    try {
      const eventId = await loadEventId(pool);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, name, description, phone, email, sort_order
         FROM event_partners
         WHERE event_id = ?
         ORDER BY sort_order ASC, created_at ASC`,
        [eventId],
      );
      res.json({
        partners: (rows as EventPartnerRow[]).map((row) => ({
          ...mapEventPartner(row),
          hasLogo: true,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/event-partners", async (req, res, next) => {
    try {
      const parsed = EventPartnerCreateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Name, description, phone, email, and logo are required.",
        });
        return;
      }
      const phone = normalizeKenyanPhone(parsed.data.phone);
      if (!phone) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Enter a valid Kenyan mobile number.",
        });
        return;
      }
      const logo = decodeUpload(parsed.data.logo, "logo");
      if ("error" in logo) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: logo.error,
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const [maxRows] = await pool.query<RowDataPacket[]>(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM event_partners WHERE event_id = ?",
        [eventId],
      );
      const maxOrder = Number(
        (maxRows[0] as { max_order: number | string } | undefined)?.max_order ??
          -1,
      );
      const sortOrder = Number.isFinite(maxOrder) ? maxOrder + 1 : 0;
      const id = randomUUID();
      const email = parsed.data.email.toLowerCase();
      await pool.query(
        `INSERT INTO event_partners
         (id, event_id, name, description, phone, email, logo_mime, logo_data, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          eventId,
          parsed.data.name,
          parsed.data.description,
          phone,
          email,
          logo.mime,
          logo.bytes,
          sortOrder,
        ],
      );
      res.status(201).json({
        id,
        name: parsed.data.name,
        description: parsed.data.description,
        phone,
        email,
        sortOrder,
        hasLogo: true,
      });
    } catch (err) {
      next(err);
    }
  });

  r.put("/event-partners/reorder", async (req, res, next) => {
    try {
      const body = z
        .object({ ids: z.array(z.string().uuid()).max(200) })
        .safeParse(req.body);
      if (!body.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Reorder payload is invalid.",
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM event_partners WHERE event_id = ? ORDER BY sort_order ASC, created_at ASC",
          [eventId],
        );
        const existingIds = (rows as Array<{ id: string }>).map((r) => r.id);
        const mismatch = reorderMismatchDetail(existingIds, body.data.ids);
        if (mismatch) {
          await conn.rollback();
          res.status(422).json({
            type: "https://httpstatuses.com/422",
            title: "Unprocessable Entity",
            status: 422,
            detail: mismatch,
          });
          return;
        }
        for (let i = 0; i < body.data.ids.length; i += 1) {
          await conn.query(
            "UPDATE event_partners SET sort_order = ?, updated_at = NOW() WHERE id = ? AND event_id = ?",
            [i, body.data.ids[i], eventId],
          );
        }
        await conn.commit();
        res.json({ ids: body.data.ids });
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

  r.patch("/event-partners/:id", async (req, res, next) => {
    try {
      const id = z.string().uuid().safeParse(req.params["id"]);
      const parsed = EventPartnerPatchBody.safeParse(req.body);
      if (!id.success || !parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid partner update.",
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const [existingRows] = await pool.query<RowDataPacket[]>(
        `SELECT id, name, description, phone, email, sort_order
         FROM event_partners WHERE id = ? AND event_id = ?`,
        [id.data, eventId],
      );
      const existing = existingRows[0] as EventPartnerRow | undefined;
      if (!existing) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Partner not found.",
        });
        return;
      }

      let phone = existing.phone;
      if (parsed.data.phone !== undefined) {
        const normalized = normalizeKenyanPhone(parsed.data.phone);
        if (!normalized) {
          res.status(422).json({
            type: "https://httpstatuses.com/422",
            title: "Unprocessable Entity",
            status: 422,
            detail: "Enter a valid Kenyan mobile number.",
          });
          return;
        }
        phone = normalized;
      }

      let logoMime: string | undefined;
      let logoBytes: Buffer | undefined;
      if (parsed.data.logo) {
        const logo = decodeUpload(parsed.data.logo, "logo");
        if ("error" in logo) {
          res.status(422).json({
            type: "https://httpstatuses.com/422",
            title: "Unprocessable Entity",
            status: 422,
            detail: logo.error,
          });
          return;
        }
        logoMime = logo.mime;
        logoBytes = logo.bytes;
      }

      const name = parsed.data.name ?? existing.name;
      const description = parsed.data.description ?? existing.description;
      const email = (parsed.data.email ?? existing.email).toLowerCase();

      if (logoMime && logoBytes) {
        await pool.query(
          `UPDATE event_partners
           SET name = ?, description = ?, phone = ?, email = ?,
               logo_mime = ?, logo_data = ?, updated_at = NOW()
           WHERE id = ? AND event_id = ?`,
          [name, description, phone, email, logoMime, logoBytes, id.data, eventId],
        );
      } else {
        await pool.query(
          `UPDATE event_partners
           SET name = ?, description = ?, phone = ?, email = ?, updated_at = NOW()
           WHERE id = ? AND event_id = ?`,
          [name, description, phone, email, id.data, eventId],
        );
      }

      res.json({
        ...mapEventPartner({
          id: id.data,
          name,
          description,
          phone,
          email,
          sort_order: existing.sort_order,
        }),
        hasLogo: true,
      });
    } catch (err) {
      next(err);
    }
  });

  r.delete("/event-partners/:id", async (req, res, next) => {
    try {
      const id = z.string().uuid().safeParse(req.params["id"]);
      if (!id.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Invalid partner id.",
        });
        return;
      }
      const eventId = await loadEventId(pool);
      const [result] = await pool.query<ResultHeader>(
        "DELETE FROM event_partners WHERE id = ? AND event_id = ?",
        [id.data, eventId],
      );
      if (result.affectedRows !== 1) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Partner not found.",
        });
        return;
      }
      res.json({ id: id.data, deleted: true });
    } catch (err) {
      next(err);
    }
  });

  r.get("/event-partners/:id/logo", async (req, res, next) => {
    try {
      await sendEventPartnerLogo(pool, req, res, { publicCache: false });
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

async function sendEventPartnerLogo(
  pool: Pool,
  req: Request,
  res: Response,
  opts: { publicCache: boolean },
): Promise<void> {
  const id = z.string().uuid().safeParse(req.params["id"]);
  if (!id.success) {
    res.status(422).json({
      type: "https://httpstatuses.com/422",
      title: "Unprocessable Entity",
      status: 422,
      detail: "Invalid partner id.",
    });
    return;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT logo_mime AS mime, logo_data AS data FROM event_partners WHERE id = ?",
    [id.data],
  );
  const row = rows[0] as { mime: string | null; data: Buffer | null } | undefined;
  if (!row?.mime || !row.data) {
    res.status(404).json({
      type: "https://httpstatuses.com/404",
      title: "Not Found",
      status: 404,
      detail: "Logo not found.",
    });
    return;
  }
  const bytes = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  res.setHeader("Content-Type", row.mime);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="event-partner-logo.${extForMime(row.mime)}"`,
  );
  res.setHeader(
    "Cache-Control",
    opts.publicCache ? "public, max-age=300" : "private, max-age=60",
  );
  res.send(bytes);
}


function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
