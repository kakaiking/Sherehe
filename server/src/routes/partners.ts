import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "../db.js";
import { isUniqueViolation } from "../db.js";
import { requirePartner } from "../auth/session.js";
import { decodeUpload } from "../partners/uploads.js";

const UploadPart = z.object({
  mime: z.string().min(3).max(64),
  data: z.string().min(8).max(3_500_000),
});

const PartnerBody = z.object({
  kind: z.enum(["partner", "sponsor"]),
  memberCount: z.number().int().min(1).max(500),
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  serviceOffered: z.string().min(1).max(200),
  website: z.string().url().max(400).optional(),
  brandInfo: z.string().max(2000).optional(),
  logo: UploadPart,
  contract: UploadPart,
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
          detail:
            "Fill name, service offered, team size, logo, and terms of service PDF.",
        });
        return;
      }
      const user = req.user;
      if (!user) return;

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
      const contract = decodeUpload(parsed.data.contract, "contract");
      if ("error" in contract) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: contract.error,
        });
        return;
      }

      const id = randomUUID();
      try {
        await pool.query(
          `INSERT INTO partner_applications
           (id, partner_id, kind, member_count, company_name, contact_name, website,
            brand_info, service_offered, logo_mime, logo_data, contract_mime, contract_data, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            id,
            user.id,
            parsed.data.kind,
            parsed.data.memberCount,
            parsed.data.companyName,
            parsed.data.contactName,
            parsed.data.website ?? null,
            parsed.data.brandInfo ?? parsed.data.serviceOffered,
            parsed.data.serviceOffered,
            logo.mime,
            logo.bytes,
            contract.mime,
            contract.bytes,
          ],
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({
            type: "https://httpstatuses.com/409",
            title: "Conflict",
            status: 409,
            detail: "You already have a partner registration under review or confirmed.",
          });
          return;
        }
        throw err;
      }
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
        `SELECT id, kind, member_count, company_name, contact_name, service_offered,
                status, ticket_order_id, created_at, reviewed_at
         FROM partner_applications
         WHERE partner_id = ?
         ORDER BY created_at DESC`,
        [user.id],
      );
      res.json({
        applications: rows.map((row) => ({
          id: row["id"],
          kind: row["kind"],
          memberCount: Number(row["member_count"]),
          companyName: row["company_name"],
          contactName: row["contact_name"],
          serviceOffered: row["service_offered"] ?? "",
          status: row["status"],
          ticketOrderId: row["ticket_order_id"] ?? null,
          claimed: Boolean(row["ticket_order_id"]),
          createdAt: row["created_at"],
          reviewedAt: row["reviewed_at"] ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/entitlement", requirePartner, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return;
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, kind, member_count, company_name, service_offered, status, ticket_order_id
         FROM partner_applications
         WHERE partner_id = ?
         ORDER BY
           CASE status
             WHEN 'confirmed' THEN 0
             WHEN 'pending' THEN 1
             ELSE 2
           END,
           created_at DESC
         LIMIT 1`,
        [user.id],
      );
      const row = rows[0];
      if (!row) {
        res.json({ application: null });
        return;
      }
      res.json({
        application: {
          id: row["id"],
          kind: row["kind"],
          memberCount: Number(row["member_count"]),
          companyName: row["company_name"],
          serviceOffered: row["service_offered"] ?? "",
          status: row["status"],
          ticketOrderId: row["ticket_order_id"] ?? null,
          claimed: Boolean(row["ticket_order_id"]),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
