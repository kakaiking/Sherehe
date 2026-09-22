import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import type { Pool, RowDataPacket } from "../db.js";
import {
  mapEventPartner,
  type EventPartnerRow,
} from "../eventPartners.js";
import {
  expireHolds,
  loadEventId,
  loadSnapshot,
  attendeeCount,
} from "../sale/orders.js";
import { getOfferings } from "../sale/engine.js";
import { ATTENDEE_TARGET } from "../sale/engine.js";
import { normalizeFlashDates } from "../sale/flashDates.js";

export function catalogRouter(pool: Pool): Router {
  const r = Router();

  r.get("/event", async (_req, res, next) => {
    try {
      await expireHolds(pool);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, name, presenter, venue, starts_at, attendee_target, flash_enabled, flash_starts_at, flash_ends_at, flash_dates
         FROM events ORDER BY created_at ASC LIMIT 1`,
      );
      const event = rows[0];
      if (!event) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "No event is configured.",
        });
        return;
      }
      res.json({
        id: event["id"],
        name: event["name"],
        presenter: event["presenter"],
        venue: event["venue"],
        startsAt: event["starts_at"],
        attendeeTarget: event["attendee_target"],
        flashEnabled: Boolean(event["flash_enabled"]),
        flashStartsAt: event["flash_starts_at"] ?? null,
        flashEndsAt: event["flash_ends_at"],
        flashDates: normalizeFlashDates(event["flash_dates"]),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/tickets", async (_req, res, next) => {
    try {
      await expireHolds(pool);
      const conn = await pool.getConnection();
      try {
        const eventId = await loadEventId(conn);
        await conn.beginTransaction();
        const snap = await loadSnapshot(conn, eventId);
        await conn.commit();
        const offerings = getOfferings(new Date(), snap);
        res.json({
          attendeeCount: snap.attendeeCount,
          attendeeTarget: ATTENDEE_TARGET,
          offerings,
        });
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

  r.get("/progress", async (_req, res, next) => {
    try {
      const eventId = await loadEventId(pool);
      const count = await attendeeCount(pool, eventId);
      res.json({ attendeeCount: count, attendeeTarget: ATTENDEE_TARGET });
    } catch (err) {
      next(err);
    }
  });

  r.get("/partners", async (_req, res, next) => {
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
        partners: (rows as EventPartnerRow[]).map(mapEventPartner),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/partners/:id/logo", async (req, res, next) => {
    try {
      await sendCatalogPartnerLogo(pool, req, res);
    } catch (err) {
      next(err);
    }
  });

  return r;
}

async function sendCatalogPartnerLogo(
  pool: Pool,
  req: Request,
  res: Response,
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
  const ext =
    row.mime === "image/png" ? "png" : row.mime === "image/webp" ? "webp" : "jpg";
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Content-Disposition", `inline; filename="partner-logo.${ext}"`);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(bytes);
}
