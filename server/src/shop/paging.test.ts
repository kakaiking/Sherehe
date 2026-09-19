import { describe, expect, it } from "vitest";
import {
  clampShopPage,
  productSlug,
  SHOP_PAGE_SIZE,
  shopOffset,
  shopOwnerId,
  shopPageCount,
} from "./paging.js";

describe("shopOwnerId", () => {
  it("scopes a stall vendor to their own meals", () => {
    expect(
      shopOwnerId({
        role: "vendor",
        userId: "vendor-1",
        stallQuery: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("vendor-1");
  });

  it("scopes a guest to the chosen stall uuid", () => {
    expect(
      shopOwnerId({
        role: "customer",
        userId: "u1",
        stallQuery: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("hides the flat catalog until a stall is chosen", () => {
    expect(
      shopOwnerId({ role: "customer", userId: "u1", stallQuery: undefined }),
    ).toBeNull();
    expect(
      shopOwnerId({ role: "customer", userId: "u1", stallQuery: "not-a-uuid" }),
    ).toBeNull();
  });
});

describe("shop paging", () => {
  it("pages nine meals at a time", () => {
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
    expect(productSlug("***", "12")).toBe("meal-12");
  });
});
