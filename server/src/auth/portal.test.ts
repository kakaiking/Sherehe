import { describe, expect, it } from "vitest";
import {
  dbAccountKind,
  parsePortal,
  parseSessionKind,
  portalRole,
  roleMatchesPortal,
} from "./portal.js";

describe("parsePortal", () => {
  it("accepts only the guest sign-in gate", () => {
    expect(parsePortal("user")).toBe("user");
    expect(parsePortal("partner")).toBeNull();
    expect(parsePortal("vendor")).toBeNull();
    expect(parsePortal("staff")).toBeNull();
    expect(parsePortal("admin")).toBeNull();
  });
});

describe("parseSessionKind", () => {
  it("accepts admin plus the guest gate", () => {
    expect(parseSessionKind("admin")).toBe("admin");
    expect(parseSessionKind("user")).toBe("user");
    expect(parseSessionKind("partner")).toBeNull();
    expect(parseSessionKind("vendor")).toBeNull();
    expect(parseSessionKind("staff")).toBeNull();
  });
});

describe("dbAccountKind", () => {
  it("maps every session onto the users table", () => {
    expect(dbAccountKind("admin")).toBe("user");
    expect(dbAccountKind("user")).toBe("user");
  });
});

describe("roleMatchesPortal", () => {
  it("lets staff use user or admin gates", () => {
    expect(portalRole("user")).toBe("customer");
    expect(roleMatchesPortal("customer", "user")).toBe(true);
    expect(roleMatchesPortal("staff", "user")).toBe(true);
    expect(roleMatchesPortal("staff", "admin")).toBe(true);
    expect(roleMatchesPortal("staff", "user")).toBe(true);
    expect(roleMatchesPortal("vendor", "user")).toBe(false);
    expect(roleMatchesPortal("partner", "user")).toBe(false);
    expect(roleMatchesPortal("customer", "admin")).toBe(false);
  });
});
