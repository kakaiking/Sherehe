import { Router } from "express";
import { z } from "zod";
import type { Pool } from "../db.js";
import type { Config } from "../config.js";
import { verifyTicketSignature } from "../tickets/hmac.js";
import { loadTicketPass, passPublicView } from "../tickets/passLookup.js";

/** Public pass lookup for phone-camera scans — never marks the ticket used. */
export function passesRouter(pool: Pool, config: Config): Router {
  const r = Router();

  r.get("/:publicId", async (req, res, next) => {
    try {
      const publicId = z.string().length(32).safeParse(req.params["publicId"]);
      const sig = z.string().length(64).safeParse(req.query["sig"]);
      if (!publicId.success || !sig.success) {
        res.status(422).json({
          type: "https://httpstatuses.com/422",
          title: "Unprocessable Entity",
          status: 422,
          detail: "Pass link is incomplete.",
        });
        return;
      }
      if (
        !verifyTicketSignature(
          publicId.data,
          sig.data,
          config.TICKET_SIGNING_SECRET,
        )
      ) {
        res.status(400).json({
          type: "https://httpstatuses.com/400",
          title: "Bad Request",
          status: 400,
          detail: "This pass link is not genuine.",
        });
        return;
      }
      const pass = await loadTicketPass(pool, publicId.data);
      if (!pass) {
        res.status(404).json({
          type: "https://httpstatuses.com/404",
          title: "Not Found",
          status: 404,
          detail: "Pass not found.",
        });
        return;
      }
      res.json(passPublicView(pass));
    } catch (err) {
      next(err);
    }
  });

  return r;
}
