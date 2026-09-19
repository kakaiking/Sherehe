import { afterEach, describe, expect, it } from "vitest";
import {
  afterAuthPath,
  continuePath,
  isSafeContinuePath,
  saveContinue,
  takeContinue,
} from "./continue";

afterEach(() => {
  sessionStorage.clear();
});

describe("isSafeContinuePath", () => {
  it("accepts in-app catalog and order paths", () => {
    expect(isSafeContinuePath("/tickets?pick=early_bird")).toBe(true);
    expect(isSafeContinuePath("/shop")).toBe(true);
    expect(isSafeContinuePath("/orders/abc")).toBe(true);
  });

  it("rejects off-site and protocol-relative URLs", () => {
    expect(isSafeContinuePath("https://evil.example/tickets")).toBe(false);
    expect(isSafeContinuePath("//evil.example/tickets")).toBe(false);
    expect(isSafeContinuePath("/login")).toBe(false);
  });
});

describe("saveContinue / takeContinue", () => {
  it("returns a saved in-app path once", () => {
    saveContinue("/tickets?pick=vip");
    expect(takeContinue()).toBe("/tickets?pick=vip");
    expect(takeContinue()).toBeNull();
  });

  it("drops an unsafe stored value", () => {
    sessionStorage.setItem("sherehe.continuePath", "//evil.example");
    expect(takeContinue()).toBeNull();
  });
});

describe("afterAuthPath", () => {
  it("lands on home when nothing is saved", () => {
    expect(afterAuthPath()).toBe("/");
  });

  it("prefers a saved in-app step", () => {
    saveContinue("/shop?pick=cap");
    expect(afterAuthPath()).toBe("/shop?pick=cap");
  });
});

describe("continuePath", () => {
  it("encodes the selected offering", () => {
    expect(continuePath("/tickets", "early_bird")).toBe(
      "/tickets?pick=early_bird",
    );
  });

  it("keeps extra shop params ahead of the pick", () => {
    expect(
      continuePath("/shop", "nyama-choma", {
        vendor: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(
      "/shop?vendor=11111111-1111-4111-8111-111111111111&pick=nyama-choma",
    );
  });
});
