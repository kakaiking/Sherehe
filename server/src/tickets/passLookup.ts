import type { Pool, RowDataPacket } from "../db.js";
import {
  ORDER_BUYER_DISPLAY,
  ORDER_BUYER_EMAIL,
  ORDER_BUYER_GIVEN,
  ORDER_BUYER_JOINS,
} from "../auth/accounts.js";
import { stubHolderCaption } from "./holder.js";
import { ticketLabel } from "./label.js";

export type TicketPassInfo = {
  id: string;
  publicId: string;
  status: "issued" | "used" | "void";
  code: string;
  label: string;
  holderName: string;
  usedAt: string | null;
  eventName: string;
  venue: string | null;
  startsAt: string | null;
};

export async function loadTicketPass(
  pool: Pool,
  publicId: string,
): Promise<TicketPassInfo | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.public_id, t.status, t.ticket_code, t.used_at,
            e.name AS event_name, e.venue, e.starts_at,
            ${ORDER_BUYER_DISPLAY} AS display_name,
            ${ORDER_BUYER_GIVEN} AS given_name,
            ${ORDER_BUYER_EMAIL} AS email
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN events e ON e.id = t.event_id
     ${ORDER_BUYER_JOINS}
     WHERE t.public_id = ?`,
    [publicId],
  );
  const row = rows[0] as
    | {
        id: string;
        public_id: string;
        status: string;
        ticket_code: string;
        used_at: Date | string | null;
        event_name: string;
        venue: string | null;
        starts_at: Date | string | null;
        display_name: string | null;
        given_name: string | null;
        email: string;
      }
    | undefined;
  if (!row) return null;
  const status =
    row.status === "used" || row.status === "void" || row.status === "issued"
      ? row.status
      : "void";
  return {
    id: row.id,
    publicId: row.public_id,
    status,
    code: row.ticket_code,
    label: ticketLabel(row.ticket_code),
    holderName: stubHolderCaption({
      ticketCode: row.ticket_code,
      displayName: row.display_name,
      givenName: row.given_name,
      email: row.email,
    }),
    usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
    eventName: row.event_name,
    venue: row.venue ?? null,
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
  };
}

export function passPublicView(pass: TicketPassInfo): {
  status: TicketPassInfo["status"];
  code: string;
  label: string;
  holderName: string;
  eventName: string;
  venue: string | null;
  startsAt: string | null;
  usedAt: string | null;
  readyForGate: boolean;
  headline: string;
  detail: string;
} {
  if (pass.status === "issued") {
    return {
      status: pass.status,
      code: pass.code,
      label: pass.label,
      holderName: pass.holderName,
      eventName: pass.eventName,
      venue: pass.venue,
      startsAt: pass.startsAt,
      usedAt: null,
      readyForGate: true,
      headline: "Valid pass",
      detail:
        "This Sherehe pass is ready for the gate. Only staff check-in counts — opening this page does not mark you as entered.",
    };
  }
  if (pass.status === "used") {
    return {
      status: pass.status,
      code: pass.code,
      label: pass.label,
      holderName: pass.holderName,
      eventName: pass.eventName,
      venue: pass.venue,
      startsAt: pass.startsAt,
      usedAt: pass.usedAt,
      readyForGate: false,
      headline: "Already checked in",
      detail:
        "This pass was scanned at the gate. Re-scanning it on your phone does not change that.",
    };
  }
  return {
    status: "void",
    code: pass.code,
    label: pass.label,
    holderName: pass.holderName,
    eventName: pass.eventName,
    venue: pass.venue,
    startsAt: pass.startsAt,
    usedAt: pass.usedAt,
    readyForGate: false,
    headline: "Pass voided",
    detail: "This pass is no longer valid for entry.",
  };
}
