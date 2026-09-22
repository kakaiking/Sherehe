import { describe, expect, it } from "vitest";
import {
  mapEventPartner,
  reorderMismatchDetail,
} from "./eventPartners.js";

describe("mapEventPartner", () => {
  it("maps snake_case sort_order to sortOrder", () => {
    expect(
      mapEventPartner({
        id: "a",
        name: "Acme",
        description: "Makes plates",
        phone: "254712345678",
        email: "hi@acme.test",
        sort_order: 2,
      }),
    ).toEqual({
      id: "a",
      name: "Acme",
      description: "Makes plates",
      phone: "254712345678",
      email: "hi@acme.test",
      sortOrder: 2,
    });
  });
});

describe("reorderMismatchDetail", () => {
  it("accepts the same ids in a new order", () => {
    expect(reorderMismatchDetail(["a", "b", "c"], ["c", "a", "b"])).toBeNull();
  });

  it("rejects a missing id", () => {
    expect(reorderMismatchDetail(["a", "b"], ["a"])).toMatch(/exactly once/i);
  });

  it("rejects an unknown id", () => {
    expect(reorderMismatchDetail(["a", "b"], ["a", "x"])).toMatch(/unknown/i);
  });

  it("rejects duplicates", () => {
    expect(reorderMismatchDetail(["a", "b"], ["a", "a"])).toMatch(/exactly once/i);
  });
});
