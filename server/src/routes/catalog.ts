import { Router } from "express";
import type { Pool, RowDataPacket } from "../db.js";
import {
  expireHolds,
  loadEventId,
  loadSnapshot,
  attendeeCount,
} from "../sale/orders.js";
import { getOfferings } from "../sale/engine.js";
import { ATTENDEE_TARGET } from "../sale/engine.js";

export function catalogRouter(pool: Pool): Router {
  const r = Router();

  r.get("/event", async (_req, res, next) => {
    try {
      await expireHolds(pool);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, name, presenter, venue, starts_at, attendee_target, flash_enabled, flash_ends_at
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
        flashEndsAt: event["flash_ends_at"],
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

  return r;
}
