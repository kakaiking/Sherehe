import { afterEach, describe, expect, it } from "vitest";
import {
  afterAuthPath,
  continuePath,
  isSafeContinuePath,
  saveContinue,
  takeContinue,
} from "./continue";
import { storePortal } from "../portal";

afterEach(() => {
  sessionStorage.clear();
});

describe("isSafeContinuePath", () => {
  it("allows guest ticket paths and admin", () => {
    expect(isSafeContinuePath("/guest/tickets?pick=early_bird")).toBe(true);
    expect(isSafeContinuePath("/guest/orders/abc")).toBe(true);
    expect(isSafeContinuePath("/admin")).toBe(true);
  });

  it("rejects partner, vendor, shop, and off-site paths", () => {
    expect(isSafeContinuePath("/guest/shop")).toBe(false);
    expect(isSafeContinuePath("/partner")).toBe(false);
    expect(isSafeContinuePath("/vendor/shop")).toBe(false);
    expect(isSafeContinuePath("https://evil.example/guest/tickets")).toBe(false);
    expect(isSafeContinuePath("/login")).toBe(false);
  });
});

describe("saveContinue / takeContinue", () => {
  it("round-trips a safe path once", () => {
    saveContinue("/guest/tickets?pick=vip");
    expect(takeContinue()).toBe("/guest/tickets?pick=vip");
    expect(takeContinue()).toBeNull();
  });
});

describe("afterAuthPath", () => {
  it("falls back to the stored portal home", () => {
    storePortal("user");
    expect(afterAuthPath()).toBe("/guest");
    storePortal("admin");
    expect(afterAuthPath()).toBe("/admin");
  });

  it("prefers a saved continue path", () => {
    saveContinue("/guest/tickets?pick=cap");
    expect(afterAuthPath()).toBe("/guest/tickets?pick=cap");
  });
});

describe("continuePath", () => {
  it("encodes pick and optional extras", () => {
    expect(continuePath("/guest/tickets", "early_bird")).toBe(
      "/guest/tickets?pick=early_bird",
    );
  });
});
