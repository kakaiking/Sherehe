export const SHOP_PAGE_SIZE = 9;

export function clampShopPage(requested: number, total: number): number {
  const pages = Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE));
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.min(Math.trunc(requested), pages);
}

export function shopOffset(page: number): number {
  return (page - 1) * SHOP_PAGE_SIZE;
}

export function shopPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE));
}

const STALL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whose meals to list. Stall vendors always see their own catalog.
 * Guests only see a stall after they pick it (`vendor` query).
 */
export function shopOwnerId(input: {
  role: string | undefined;
  userId: string | undefined;
  stallQuery: string | undefined;
}): string | null {
  if (input.role === "vendor" && input.userId) return input.userId;
  const stall = input.stallQuery ?? "";
  return STALL_ID.test(stall) ? stall : null;
}

/** Stable unique slug from a meal name plus a UUID fragment. */
export function productSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = id.replace(/-/g, "").slice(0, 6);
  return `${base || "meal"}-${suffix}`;
}
