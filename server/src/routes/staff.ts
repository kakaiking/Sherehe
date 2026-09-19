import { Router } from "express";
import { z } from "zod";
import type { Pool, RowDataPacket } from "../db.js";
import type { Config } from "../config.js";
import { requireStaff } from "../auth/session.js";
import { attendeeCount, loadEventId } from "../sale/orders.js";
import { ATTENDEE_TARGET } from "../sale/engine.js";
import { verifyTicketSignature } from "../tickets/hmac.js";

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
        "SELECT id, kind, company_name, member_count, status, created_at FROM partner_applications ORDER BY created_at DESC LIMIT 50",
      );
      const [vendors] = await pool.query<RowDataPacket[]>(
        `SELECT v.id, v.company_name, v.category, v.status, p.name AS package_name, p.fee_ksh
         FROM vendor_applications v
         JOIN vendor_packages p ON p.id = v.package_id
         ORDER BY v.created_at DESC LIMIT 50`,
      );
      const [products] = await pool.query<RowDataPacket[]>(
        "SELECT slug, name, stock, price_ksh FROM products",
      );
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
        partners,
        vendors,
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
        });
        return;
      }
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id, status FROM tickets WHERE public_id = ?",
        [body.data.publicId],
      );
      const ticket = rows[0] as { id: string; status: string } | undefined;
      if (!ticket) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Ticket not found.",
        });
        return;
      }
      if (ticket.status === "used") {
        res.status(409).json({
          type: "https://httpstatuses.com/409",
          title: "Conflict",
          status: 409,
          detail: "This ticket was already scanned.",
        });
        return;
      }
      await pool.query(
        "UPDATE tickets SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'issued'",
        [ticket.id],
      );
      res.json({ status: "used" });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
