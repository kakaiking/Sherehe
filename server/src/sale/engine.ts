export const ATTENDEE_TARGET = 200;
export const HOLD_MS = 10 * 60 * 1000;

export type TicketCode =
  | "early_bird"
  | "rush"
  | "regular"
  | "vip"
  | "viip"
  | "group"
  | "flash";

export type TicketType = {
  code: TicketCode;
  name: string;
  priceKsh: number;
  seatsPerUnit: number;
  capacity: number | null;
};

export type SaleWindow = {
  ticketCode: TicketCode;
  startsAt: Date;
  endsAt: Date | null;
};

export type SalesSnapshot = {
  attendeeCount: number;
  flashEnabled: boolean;
  flashEndsAt: Date | null;
  windows: SaleWindow[];
  types: TicketType[];
  /** Units already paid or still on an unexpired hold, keyed by ticket code. */
  reservedUnits: Partial<Record<TicketCode, number>>;
};

function windowOpen(now: Date, windows: SaleWindow[], code: TicketCode): boolean {
  return windows.some((w) => {
    if (w.ticketCode !== code) return false;
    if (now < w.startsAt) return false;
    if (w.endsAt !== null && now >= w.endsAt) return false;
    return true;
  });
}

function remainingUnits(type: TicketType, reserved: number): number {
  if (type.capacity === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, type.capacity - reserved);
}

export function flashEligible(now: Date, snap: SalesSnapshot): boolean {
  if (!snap.flashEnabled) return false;
  if (snap.flashEndsAt === null) return false;
  if (now >= snap.flashEndsAt) return false;
  if (snap.attendeeCount >= ATTENDEE_TARGET) return false;
  return true;
}

export type Offering = TicketType & { remainingUnits: number };

/**
 * Public catalog: which ticket SKUs may be sold at `now`.
 * Flash is omitted unless armed, unexpired, and attendees are below the target.
 */
export function getOfferings(now: Date, snap: SalesSnapshot): Offering[] {
  const showFlash = flashEligible(now, snap);
  const out: Offering[] = [];
  for (const type of snap.types) {
    const reserved = snap.reservedUnits[type.code] ?? 0;
    const remaining = remainingUnits(type, reserved);
    if (remaining <= 0) continue;
    if (type.code === "flash") {
      if (!showFlash) continue;
      out.push({ ...type, remainingUnits: remaining });
      continue;
    }
    if (!windowOpen(now, snap.windows, type.code)) continue;
    out.push({ ...type, remainingUnits: remaining });
  }
  return out;
}

export type CheckoutRequest = {
  code: TicketCode;
  qty: number;
};

export type CheckoutDenial =
  | "not_on_sale"
  | "sold_out"
  | "flash_closed"
  | "invalid_qty";

export function assertCheckout(
  now: Date,
  snap: SalesSnapshot,
  req: CheckoutRequest,
): { ok: true; offering: Offering } | { ok: false; reason: CheckoutDenial } {
  if (!Number.isInteger(req.qty) || req.qty < 1 || req.qty > 20) {
    return { ok: false, reason: "invalid_qty" };
  }
  return assertOfferingAvailable(now, snap, req);
}

/**
 * Approved partners claim free team tickets once. Quantity is the registered
 * member count (up to 500). Group packages are excluded — one stub per member.
 */
export function assertPartnerCheckout(
  now: Date,
  snap: SalesSnapshot,
  req: CheckoutRequest,
): { ok: true; offering: Offering } | { ok: false; reason: CheckoutDenial } {
  if (!Number.isInteger(req.qty) || req.qty < 1 || req.qty > 500) {
    return { ok: false, reason: "invalid_qty" };
  }
  if (req.code === "group") {
    return { ok: false, reason: "not_on_sale" };
  }
  return assertOfferingAvailable(now, snap, req);
}

function assertOfferingAvailable(
  now: Date,
  snap: SalesSnapshot,
  req: CheckoutRequest,
): { ok: true; offering: Offering } | { ok: false; reason: CheckoutDenial } {
  const offerings = getOfferings(now, snap);
  const offering = offerings.find((o) => o.code === req.code);
  if (!offering) {
    if (req.code === "flash") {
      return { ok: false, reason: "flash_closed" };
    }
    return { ok: false, reason: "not_on_sale" };
  }
  if (req.qty > offering.remainingUnits) {
    return { ok: false, reason: "sold_out" };
  }
  return { ok: true, offering };
}

export function seatsFor(type: TicketType, qty: number): number {
  return type.seatsPerUnit * qty;
}

/**
 * Gate stubs to print: one QR per purchased unit. A group of five is still
 * one stub (capacity still uses seatsFor).
 */
export function stubCountFor(qty: number): number {
  return qty;
}
