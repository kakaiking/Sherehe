import { randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "../db.js";
import QRCode from "qrcode";
import {
  assertCheckout,
  HOLD_MS,
  seatsFor,
  stubCountFor,
  type TicketCode,
  type TicketType,
  type SalesSnapshot,
  type SaleWindow,
} from "../sale/engine.js";
import { normalizeFlashDates } from "../sale/flashDates.js";
import { signTicketPublicId } from "../tickets/hmac.js";
import { ticketPassUrl } from "../tickets/passUrl.js";
import { stubHolderCaption } from "../tickets/holder.js";
import { log } from "../log.js";
import type { AccountKind } from "../auth/accounts.js";
import {
  ORDER_BUYER_DISPLAY,
  ORDER_BUYER_EMAIL,
  ORDER_BUYER_GIVEN,
  ORDER_BUYER_JOINS,
} from "../auth/accounts.js";

type TicketTypeRow = RowDataPacket & {
  code: TicketCode;
  name: string;
  price_ksh: number;
  seats_per_unit: number;
  capacity: number | null;
};

type WindowRow = RowDataPacket & {
  ticket_code: TicketCode;
  starts_at: Date;
  ends_at: Date | null;
};

type EventRow = RowDataPacket & {
  id: string;
  attendee_target: number;
  flash_enabled: number;
  flash_starts_at: Date | null;
  flash_ends_at: Date | null;
  flash_dates: unknown;
};

export async function loadEventId(conn: Pool | PoolConnection): Promise<string> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM events ORDER BY created_at ASC LIMIT 1",
  );
  const row = rows[0] as { id: string } | undefined;
  if (!row) throw new Error("no_event");
  return row.id;
}

export async function attendeeCount(
  conn: Pool | PoolConnection,
  eventId: string,
): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(oi.seats), 0) AS seats
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.event_id = ? AND o.status = 'paid' AND o.kind = 'tickets'`,
    [eventId],
  );
  const n = rows[0] as { seats: number } | undefined;
  return Number(n?.seats ?? 0);
}

async function reservedUnits(
  conn: PoolConnection,
  eventId: string,
): Promise<Partial<Record<TicketCode, number>>> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT oi.sku_code AS code, COALESCE(SUM(oi.qty), 0) AS qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.event_id = ?
       AND o.kind = 'tickets'
       AND (
         o.status = 'paid'
         OR (o.status = 'pending' AND o.hold_expires_at > NOW())
       )
     GROUP BY oi.sku_code`,
    [eventId],
  );
  const out: Partial<Record<TicketCode, number>> = {};
  for (const row of rows as Array<{ code: TicketCode; qty: number }>) {
    out[row.code] = Number(row.qty);
  }
  return out;
}

export async function loadSnapshot(
  conn: PoolConnection,
  eventId: string,
): Promise<SalesSnapshot> {
  const [eventRows] = await conn.query<EventRow[]>(
    "SELECT id, attendee_target, flash_enabled, flash_starts_at, flash_ends_at, flash_dates FROM events WHERE id = ? FOR UPDATE",
    [eventId],
  );
  const event = eventRows[0];
  if (!event) throw new Error("no_event");
  const [typeRows] = await conn.query<TicketTypeRow[]>(
    "SELECT code, name, price_ksh, seats_per_unit, capacity FROM ticket_types WHERE event_id = ?",
    [eventId],
  );
  const [windowRows] = await conn.query<WindowRow[]>(
    "SELECT ticket_code, starts_at, ends_at FROM sale_windows WHERE event_id = ?",
    [eventId],
  );
  const types: TicketType[] = typeRows.map((t) => ({
    code: t.code,
    name: t.name,
    priceKsh: t.price_ksh,
    seatsPerUnit: t.seats_per_unit,
    capacity: t.capacity,
  }));
  const windows: SaleWindow[] = windowRows.map((w) => ({
    ticketCode: w.ticket_code,
    startsAt: new Date(w.starts_at),
    endsAt: w.ends_at ? new Date(w.ends_at) : null,
  }));
  return {
    attendeeCount: await attendeeCount(conn, eventId),
    flashEnabled: Boolean(event.flash_enabled),
    flashStartsAt: event.flash_starts_at ? new Date(event.flash_starts_at) : null,
    flashEndsAt: event.flash_ends_at ? new Date(event.flash_ends_at) : null,
    flashDates: normalizeFlashDates(event.flash_dates),
    windows,
    types,
    reservedUnits: await reservedUnits(conn, eventId),
  };
}

export async function expireHolds(pool: Pool): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT o.id, oi.sku_code, oi.qty
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status = 'pending'
         AND o.kind = 'product'
         AND o.hold_expires_at IS NOT NULL
         AND o.hold_expires_at <= NOW()`,
    );
    for (const row of rows as Array<{ sku_code: string; qty: number }>) {
      await conn.query("UPDATE products SET stock = stock + ? WHERE slug = ?", [
        row.qty,
        row.sku_code,
      ]);
    }
    await conn.query(
      "UPDATE orders SET status = 'expired' WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at <= NOW()",
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function createTicketOrder(
  pool: Pool,
  userId: string,
  code: TicketCode,
  qty: number,
  accountKind: AccountKind = "user",
): Promise<{ orderId: string; totalKsh: number; holdExpiresAt: Date }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "UPDATE orders SET status = 'expired' WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at <= NOW()",
    );
    const eventId = await loadEventId(conn);
    const snap = await loadSnapshot(conn, eventId);
    const now = new Date();
    const checked = assertCheckout(now, snap, { code, qty });
    if (!checked.ok) {
      const err = new Error(checked.reason);
      err.name = "CheckoutError";
      throw err;
    }
    const orderId = randomUUID();
    const holdExpiresAt = new Date(now.getTime() + HOLD_MS);
    const total = checked.offering.priceKsh * qty;
    await conn.query(
      `INSERT INTO orders (id, account_kind, user_id, event_id, kind, status, total_ksh, hold_expires_at)
       VALUES (?, ?, ?, ?, 'tickets', 'pending', ?, ?)`,
      [orderId, accountKind, userId, eventId, total, holdExpiresAt],
    );
    await conn.query(
      `INSERT INTO order_items (id, order_id, sku_kind, sku_code, title, qty, unit_price_ksh, seats)
       VALUES (?, ?, 'ticket', ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        orderId,
        code,
        checked.offering.name,
        qty,
        checked.offering.priceKsh,
        seatsFor(checked.offering, qty),
      ],
    );
    await conn.commit();
    return { orderId, totalKsh: total, holdExpiresAt };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function fulfillPaidOrder(
  pool: Pool,
  orderId: string,
  ticketSecret: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orderRows] = await conn.query<RowDataPacket[]>(
      "SELECT id, status, kind, event_id FROM orders WHERE id = ? FOR UPDATE",
      [orderId],
    );
    const order = orderRows[0] as
      | { id: string; status: string; kind: string; event_id: string | null }
      | undefined;
    if (!order) {
      throw new Error("order_missing");
    }
    if (order.status === "paid") {
      await conn.commit();
      return;
    }
    if (order.status !== "pending") {
      throw new Error("order_not_pending");
    }
    await conn.query(
      "UPDATE orders SET status = 'paid', paid_at = NOW(), hold_expires_at = NULL WHERE id = ?",
      [orderId],
    );
    if (order.kind === "tickets" && order.event_id) {
      const [items] = await conn.query<RowDataPacket[]>(
        "SELECT sku_code, qty, seats FROM order_items WHERE order_id = ?",
        [orderId],
      );
      for (const item of items as Array<{
        sku_code: string;
        qty: number;
        seats: number;
      }>) {
        const stubs = stubCountFor(item.qty);
        for (let i = 0; i < stubs; i += 1) {
          await conn.query(
            `INSERT INTO tickets (id, order_id, event_id, ticket_code, public_id, status)
             VALUES (?, ?, ?, ?, ?, 'issued')`,
            [
              randomUUID(),
              orderId,
              order.event_id,
              item.sku_code,
              randomBytes(16).toString("hex"),
            ],
          );
        }
      }
    }
    if (order.kind === "vendor") {
      await conn.query(
        "UPDATE vendor_applications SET status = 'paid' WHERE order_id = ?",
        [orderId],
      );
    }
    if (order.kind === "service") {
      await conn.query(
        "UPDATE service_bookings SET status = 'paid' WHERE order_id = ?",
        [orderId],
      );
    }
    await conn.commit();
    log("info", "order_paid", { order_kind: order.kind });
    void ticketSecret;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Stamp the first successful PDF download on a paid ticket order. */
export async function markTicketStubDownloaded(
  pool: Pool,
  orderId: string,
): Promise<void> {
  await pool.query(
    `UPDATE orders
     SET stub_downloaded_at = COALESCE(stub_downloaded_at, NOW())
     WHERE id = ? AND kind = 'tickets' AND status = 'paid'`,
    [orderId],
  );
}

/**
 * Staff refund: void unused tickets and mark order/payment refunded.
 * Rejects if any ticket was already scanned (used).
 * Money reverse via Daraja is left to ops when live (logged with receipt).
 */
export async function refundPaidTicketOrder(
  pool: Pool,
  orderId: string,
): Promise<{
  receipt: string | null;
  totalKsh: number;
  ticketsVoided: number;
}> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orderRows] = await conn.query<RowDataPacket[]>(
      "SELECT id, kind, status, total_ksh FROM orders WHERE id = ? FOR UPDATE",
      [orderId],
    );
    const order = orderRows[0] as
      | { id: string; kind: string; status: string; total_ksh: number }
      | undefined;
    if (!order || order.kind !== "tickets") {
      throw Object.assign(new Error("order_not_found"), { name: "RefundError" });
    }
    if (order.status === "refunded") {
      throw Object.assign(new Error("already_refunded"), { name: "RefundError" });
    }
    if (order.status !== "paid") {
      throw Object.assign(new Error("order_not_paid"), { name: "RefundError" });
    }
    const [ticketRows] = await conn.query<RowDataPacket[]>(
      "SELECT id, status FROM tickets WHERE order_id = ? FOR UPDATE",
      [orderId],
    );
    const tickets = ticketRows as Array<{ id: string; status: string }>;
    if (tickets.some((t) => t.status === "used")) {
      throw Object.assign(new Error("ticket_already_used"), {
        name: "RefundError",
      });
    }
    const [payRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, receipt FROM payments
       WHERE order_id = ? AND status = 'succeeded'
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [orderId],
    );
    const pay = payRows[0] as { id: string; receipt: string | null } | undefined;
    let voided = 0;
    for (const t of tickets) {
      if (t.status === "issued" || t.status === "void") {
        if (t.status === "issued") {
          await conn.query(
            "UPDATE tickets SET status = 'void' WHERE id = ? AND status = 'issued'",
            [t.id],
          );
          voided += 1;
        }
      }
    }
    await conn.query(
      "UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'paid'",
      [orderId],
    );
    if (pay) {
      await conn.query(
        "UPDATE payments SET status = 'refunded' WHERE id = ? AND status = 'succeeded'",
        [pay.id],
      );
    }
    await conn.commit();
    return {
      receipt: pay?.receipt ?? null,
      totalKsh: Number(order.total_ksh),
      ticketsVoided: voided,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** True when this buyer already downloaded a paid ticket stub. */
export async function userHasDownloadedTicket(
  pool: Pool,
  userId: string,
  accountKind: AccountKind = "user",
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM orders
     WHERE user_id = ?
       AND account_kind = ?
       AND kind = 'tickets'
       AND status = 'paid'
       AND stub_downloaded_at IS NOT NULL
     LIMIT 1`,
    [userId, accountKind],
  );
  return rows.length > 0;
}

export async function ticketsForOrder(
  pool: Pool,
  orderId: string,
  secret: string,
  clientOrigin: string,
): Promise<
  Array<{
    publicId: string;
    signature: string;
    qrDataUrl: string;
    code: string;
    holderName: string;
  }>
> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.public_id, t.ticket_code,
            ${ORDER_BUYER_DISPLAY} AS display_name,
            ${ORDER_BUYER_GIVEN} AS given_name,
            ${ORDER_BUYER_EMAIL} AS email
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     ${ORDER_BUYER_JOINS}
     WHERE t.order_id = ?`,
    [orderId],
  );
  const out: Array<{
    publicId: string;
    signature: string;
    qrDataUrl: string;
    code: string;
    holderName: string;
  }> = [];
  for (const row of rows as Array<{
    public_id: string;
    ticket_code: string;
    display_name: string | null;
    given_name: string | null;
    email: string;
  }>) {
    const signature = signTicketPublicId(row.public_id, secret);
    const payload = ticketPassUrl(clientOrigin, row.public_id, signature);
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 192 });
    out.push({
      publicId: row.public_id,
      signature,
      qrDataUrl,
      code: row.ticket_code,
      holderName: stubHolderCaption({
        ticketCode: row.ticket_code,
        displayName: row.display_name,
        givenName: row.given_name,
        email: row.email,
      }),
    });
  }
  return out;
}
