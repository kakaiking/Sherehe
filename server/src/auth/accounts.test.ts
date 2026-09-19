import { describe, expect, it } from "vitest";
import {
  accountTable,
  roleForAccountKind,
} from "./accounts.js";

describe("accountTable", () => {
  it("gives each portal its own identity table", () => {
    expect(accountTable("user")).toBe("users");
    expect(accountTable("partner")).toBe("partners");
    expect(accountTable("vendor")).toBe("vendors");
  });
});

describe("roleForAccountKind", () => {
  it("keeps guest accounts as customers and the other gates named", () => {
    expect(roleForAccountKind("user")).toBe("customer");
    expect(roleForAccountKind("partner")).toBe("partner");
    expect(roleForAccountKind("vendor")).toBe("vendor");
  });
});
