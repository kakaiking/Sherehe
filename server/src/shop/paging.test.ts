import { describe, expect, it } from "vitest";
import {
  clampShopPage,
  productSlug,
  SHOP_PAGE_SIZE,
  shopOffset,
  shopPageCount,
} from "./paging.js";

describe("shop paging", () => {
  it("pages nine plates at a time", () => {
    expect(SHOP_PAGE_SIZE).toBe(9);
    expect(shopOffset(1)).toBe(0);
    expect(shopOffset(2)).toBe(9);
    expect(shopPageCount(0)).toBe(1);
    expect(shopPageCount(9)).toBe(1);
    expect(shopPageCount(10)).toBe(2);
    expect(clampShopPage(99, 12)).toBe(2);
    expect(clampShopPage(0, 12)).toBe(1);
  });
});

describe("productSlug", () => {
  it("stays url-safe and unique per id fragment", () => {
    expect(productSlug("Nyama Choma!", "aabbccdd-eeee-ffff-0000-111111111111")).toBe(
      "nyama-choma-aabbcc",
    );
    expect(productSlug("***", "12")).toBe("plate-12");
  });
});
