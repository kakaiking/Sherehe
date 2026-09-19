import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "../db.js";
import { requirePartner } from "../auth/session.js";

const PartnerBody = z.object({
  kind: z.enum(["partner", "sponsor"]),
  memberCount: z.number().int().min(1).max(500),
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  website: z.string().url().max(400).optional(),
  brandInfo: z.string().min(1).max(2000),
});

export function partnersRouter(pool: Pool): Router {
  const r = Router();

  r.post("/", requirePartner, async (req, res, next) => {
    try {
      const parsed = PartnerBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Fill partner or sponsor type, member count, and brand details.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;
      const id = randomUUID();
      await pool.query(
        `INSERT INTO partner_applications
         (id, partner_id, kind, member_count, company_name, contact_name, website, brand_info, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          id,
          user.id,
          parsed.data.kind,
          parsed.data.memberCount,
          parsed.data.companyName,
          parsed.data.contactName,
          parsed.data.website ?? null,
          parsed.data.brandInfo,
        ],
      );
      res.status(201).json({
        id,
        status: "pending",
        detail: "The event team will review and confirm this registration.",
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/mine", requirePartner, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id, kind, member_count, company_name, status, created_at FROM partner_applications WHERE partner_id = ? ORDER BY created_at DESC",
        [user.id],
      );
      res.json({ applications: rows });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
