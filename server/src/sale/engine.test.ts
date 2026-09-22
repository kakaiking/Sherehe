import { describe, expect, it } from "vitest";
import {
  ATTENDEE_TARGET,
  assertCapacityPool,
  assertCheckout,
  assertPartnerCheckout,
  flashEligible,
  getOfferings,
  stubCountFor,
  TICKET_CAPACITY_POOL,
  TICKET_CODES,
  type SalesSnapshot,
  type TicketCode,
  type TicketType,
} from "./engine.js";

const types: TicketType[] = [
  {
    code: "early_bird",
    name: "Early Bird",
    priceKsh: 2000,
    seatsPerUnit: 1,
    capacity: 40,
  },
  {
    code: "rush",
    name: "Rush Ticket",
    priceKsh: 2800,
    seatsPerUnit: 1,
    capacity: 40,
  },
  {
    code: "regular",
    name: "Regular Ticket",
    priceKsh: 3500,
    seatsPerUnit: 1,
    capacity: 80,
  },
  {
    code: "vip",
    name: "VIP Ticket",
    priceKsh: 4500,
    seatsPerUnit: 1,
    capacity: 20,
  },
  {
    code: "viip",
    name: "VIIP Ticket",
    priceKsh: 5500,
    seatsPerUnit: 1,
    capacity: 10,
  },
  {
    code: "group",
    name: "Group Ticket (5 people)",
    priceKsh: 13000,
    seatsPerUnit: 5,
    capacity: 10,
  },
  {
    code: "flash",
    name: "Flash Sale",
    priceKsh: 1500,
    seatsPerUnit: 1,
    capacity: 50,
  },
];

function snap(over: Partial<SalesSnapshot> = {}): SalesSnapshot {
  return {
    attendeeCount: 0,
    flashEnabled: false,
    flashStartsAt: null,
    flashEndsAt: null,
    flashDates: [],
    windows: [
      {
        ticketCode: "early_bird",
        startsAt: new Date("2026-09-01T00:00:00Z"),
        endsAt: new Date("2026-09-20T00:00:00Z"),
      },
      {
        ticketCode: "regular",
        startsAt: new Date("2026-09-01T00:00:00Z"),
        endsAt: null,
      },
      {
        ticketCode: "vip",
        startsAt: new Date("2026-09-01T00:00:00Z"),
        endsAt: null,
      },
      {
        ticketCode: "viip",
        startsAt: new Date("2026-09-01T00:00:00Z"),
        endsAt: null,
      },
      {
        ticketCode: "group",
        startsAt: new Date("2026-09-01T00:00:00Z"),
        endsAt: null,
      },
    ],
    types,
    reservedUnits: {},
    ...over,
  };
}

describe("getOfferings", () => {
  it("lists windowed types and omits flash when unarmed", () => {
    const now = new Date("2026-09-18T10:00:00Z");
    const codes = getOfferings(now, snap()).map((o) => o.code);
    expect(codes).toContain("early_bird");
    expect(codes).toContain("regular");
    expect(codes).toContain("group");
    expect(codes).not.toContain("flash");
    expect(codes).not.toContain("rush");
  });

  it("includes rush only inside a rush window", () => {
    const now = new Date("2026-09-19T10:00:00Z");
    const withRush = snap({
      windows: [
        ...snap().windows,
        {
          ticketCode: "rush",
          startsAt: new Date("2026-09-19T00:00:00Z"),
          endsAt: new Date("2026-09-21T00:00:00Z"),
        },
      ],
    });
    expect(getOfferings(now, withRush).map((o) => o.code)).toContain("rush");
    expect(
      getOfferings(new Date("2026-09-22T10:00:00Z"), withRush).map((o) => o.code),
    ).not.toContain("rush");
  });

  it("hides sold-out SKUs", () => {
    const now = new Date("2026-09-18T10:00:00Z");
    const codes = getOfferings(
      now,
      snap({ reservedUnits: { early_bird: 40 } }),
    ).map((o) => o.code);
    expect(codes).not.toContain("early_bird");
  });
});

describe("flash sale", () => {
  const ends = new Date("2026-09-25T00:00:00Z");
  const now = new Date("2026-09-24T10:00:00Z");

  it("is eligible only when armed, unexpired, and under the 200 target", () => {
    expect(
      flashEligible(now, snap({ flashEnabled: true, flashEndsAt: ends })),
    ).toBe(true);
    expect(
      flashEligible(now, snap({ flashEnabled: false, flashEndsAt: ends })),
    ).toBe(false);
    expect(
      flashEligible(
        new Date("2026-09-26T00:00:00Z"),
        snap({ flashEnabled: true, flashEndsAt: ends }),
      ),
    ).toBe(false);
    expect(
      flashEligible(
        now,
        snap({
          flashEnabled: true,
          flashEndsAt: ends,
          attendeeCount: ATTENDEE_TARGET,
        }),
      ),
    ).toBe(false);
  });

  it("is not eligible before flashStartsAt and is eligible once the window opens", () => {
    const starts = new Date("2026-09-24T12:00:00Z");
    expect(
      flashEligible(
        now,
        snap({
          flashEnabled: true,
          flashStartsAt: starts,
          flashEndsAt: ends,
        }),
      ),
    ).toBe(false);
    expect(
      flashEligible(
        new Date("2026-09-24T12:00:00Z"),
        snap({
          flashEnabled: true,
          flashStartsAt: starts,
          flashEndsAt: ends,
        }),
      ),
    ).toBe(true);
  });

  it("is eligible on a selected flash calendar day", () => {
    expect(
      flashEligible(
        now,
        snap({
          flashEnabled: true,
          flashDates: ["2026-09-24"],
        }),
      ),
    ).toBe(true);
    expect(
      flashEligible(
        now,
        snap({
          flashEnabled: true,
          flashDates: ["2026-09-25"],
        }),
      ),
    ).toBe(false);
  });

  it("treats a null flashStartsAt as already started", () => {
    expect(
      flashEligible(
        now,
        snap({ flashEnabled: true, flashStartsAt: null, flashEndsAt: ends }),
      ),
    ).toBe(true);
  });

  it("refuses checkout with flash_closed at or above 200 attendees", () => {
    const result = assertCheckout(
      now,
      snap({
        flashEnabled: true,
        flashEndsAt: ends,
        attendeeCount: 200,
      }),
      { code: "flash", qty: 1 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("flash_closed");
    }
  });

  it("allows a flash unit when under target", () => {
    const result = assertCheckout(
      now,
      snap({ flashEnabled: true, flashEndsAt: ends, attendeeCount: 199 }),
      { code: "flash", qty: 1 },
    );
    expect(result.ok).toBe(true);
  });
});

describe("assertCheckout", () => {
  const now = new Date("2026-09-18T10:00:00Z");

  it("rejects qty outside 1–20", () => {
    const r = assertCheckout(now, snap(), { code: "regular", qty: 0 });
    expect(r.ok).toBe(false);
  });

  it("rejects oversell against remaining units", () => {
    const r = assertCheckout(
      now,
      snap({ reservedUnits: { regular: 79 } }),
      { code: "regular", qty: 2 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sold_out");
  });

  it("rejects a type whose window has not opened", () => {
    const r = assertCheckout(now, snap(), { code: "rush", qty: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_on_sale");
  });
});

describe("assertPartnerCheckout", () => {
  const now = new Date("2026-09-18T10:00:00Z");

  it("allows team-sized qty above the guest max of 20", () => {
    const r = assertPartnerCheckout(now, snap(), { code: "regular", qty: 25 });
    expect(r.ok).toBe(true);
  });

  it("rejects group packages for partner free claims", () => {
    const r = assertPartnerCheckout(now, snap(), { code: "group", qty: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_on_sale");
  });

  it("rejects qty above 500", () => {
    const r = assertPartnerCheckout(now, snap(), { code: "regular", qty: 501 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_qty");
  });
});

describe("stubCountFor", () => {
  it("issues one gate stub per unit so a group of five is a single QR", () => {
    expect(stubCountFor(1)).toBe(1);
    expect(stubCountFor(2)).toBe(2);
  });
});

describe("assertCapacityPool", () => {
  const balanced: Record<TicketCode, number> = {
    early_bird: 125,
    rush: 50,
    regular: 25,
    vip: 20,
    viip: 20,
    group: 10,
    flash: 50,
  };

  it("accepts the fixed 300 allocation", () => {
    const r = assertCapacityPool(balanced);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sum).toBe(TICKET_CAPACITY_POOL);
  });

  it("rejects a sum that is not the pool", () => {
    const r = assertCapacityPool({ ...balanced, early_bird: 126 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("sum_mismatch");
      expect(r.sum).toBe(301);
    }
  });

  it("rejects a missing ticket code", () => {
    const { early_bird: _drop, ...rest } = balanced;
    const r = assertCapacityPool(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("incomplete");
  });

  it("lists every ticket code in the pool", () => {
    expect(TICKET_CODES).toEqual([
      "early_bird",
      "rush",
      "regular",
      "vip",
      "viip",
      "group",
      "flash",
    ]);
  });
});
