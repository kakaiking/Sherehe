/** Canonical night for seed, migrate refresh, and PDF fallback. */

export const EVENT_VENUE = "Fused Lens Studios, Kirigiti, Kiambu";

/** Saturday 28 Nov 2026, 16:00 EAT — guest UI shows the calendar date, not the clock. */
export const EVENT_STARTS_AT = new Date("2026-11-28T16:00:00+03:00");

/** Stall fee due a week before the night. */
export const VENDOR_PAY_BY = new Date("2026-11-21T16:00:00+03:00");

export const VENDOR_SETUP: Record<"stall_std" | "stall_prem", string> = {
  stall_std: "28 Nov 08:00–10:00",
  stall_prem: "28 Nov 07:00–10:00",
};
