import { describe, expect, it } from "vitest";
import {
  parsePortal,
  portalRole,
  roleMatchesPortal,
} from "./portal.js";

describe("parsePortal", () => {
  it("accepts only the three sign-in gates", () => {
    expect(parsePortal("user")).toBe("user");
    expect(parsePortal("partner")).toBe("partner");
    expect(parsePortal("vendor")).toBe("vendor");
    expect(parsePortal("staff")).toBeNull();
    expect(parsePortal("admin")).toBeNull();
  });
});

describe("roleMatchesPortal", () => {
  it("maps guest and staff onto the user gate", () => {
    expect(portalRole("user")).toBe("customer");
    expect(roleMatchesPortal("customer", "user")).toBe(true);
    expect(roleMatchesPortal("staff", "user")).toBe(true);
    expect(roleMatchesPortal("staff", "vendor")).toBe(false);
    expect(roleMatchesPortal("vendor", "user")).toBe(false);
    expect(roleMatchesPortal("partner", "partner")).toBe(true);
  });
});
