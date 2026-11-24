/** Canonical night for seed, migrate refresh, and PDF fallback. */

export const EVENT_VENUE = "Fused Lens Studios, Kirigiti, Kiambu";

/** Sunday 13 Dec 2026, 16:00 EAT — guest UI shows the calendar date; doors copy is separate. */
export const EVENT_STARTS_AT = new Date("2026-12-13T16:00:00+03:00");

/** Guest-facing doors line under the venue locality. */
export const EVENT_DOORS = "From 12 Noon till Late";

/** Stall fee due a week before the night. */
export const VENDOR_PAY_BY = new Date("2026-12-06T16:00:00+03:00");

export const VENDOR_SETUP: Record<"stall_std" | "stall_prem", string> = {
  stall_std: "13 Dec 08:00–10:00",
  stall_prem: "13 Dec 07:00–10:00",
};
