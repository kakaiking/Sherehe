/** Event partners showcase helpers (admin CMS + public catalog). */

export type EventPartnerPublic = {
  id: string;
  name: string;
  description: string;
  phone: string;
  email: string;
  sortOrder: number;
};

export type EventPartnerRow = {
  id: string;
  name: string;
  description: string;
  phone: string;
  email: string;
  sort_order: number;
};

/** Map a DB row to the public/staff JSON shape (no binary). */
export function mapEventPartner(row: EventPartnerRow): EventPartnerPublic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    phone: row.phone,
    email: row.email,
    sortOrder: row.sort_order,
  };
}

/**
 * Reorder payload must list every partner id for the event exactly once.
 * Returns null when valid; otherwise an error detail string.
 */
export function reorderMismatchDetail(
  existingIds: string[],
  requestedIds: string[],
): string | null {
  if (requestedIds.length !== existingIds.length) {
    return "Reorder list must include every partner exactly once.";
  }
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  for (const id of requestedIds) {
    if (!existing.has(id)) {
      return "Reorder list includes an unknown partner.";
    }
    if (seen.has(id)) {
      return "Reorder list must include every partner exactly once.";
    }
    seen.add(id);
  }
  for (const id of existingIds) {
    if (!seen.has(id)) {
      return "Reorder list must include every partner exactly once.";
    }
  }
  return null;
}
