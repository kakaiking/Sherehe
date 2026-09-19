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

/** Stable unique slug from a plate name plus a UUID fragment. */
export function productSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = id.replace(/-/g, "").slice(0, 6);
  return `${base || "plate"}-${suffix}`;
}
