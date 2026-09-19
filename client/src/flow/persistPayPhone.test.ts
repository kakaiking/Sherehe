import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../App";
import { persistPayPhone } from "./persistPayPhone";

const user: User = {
  id: "u1",
  email: "a@example.com",
  phone: "254700000000",
  role: "customer",
  displayName: "Ada",
  givenName: "Ada",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistPayPhone", () => {
  it("skips a write when the account already has those digits", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onAuth = vi.fn();
    await persistPayPhone("700000000", user.phone, onAuth);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAuth).not.toHaveBeenCalled();
  });

  it("posts a new number and returns the updated user", async () => {
    const next = { ...user, phone: "254712345678" };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url).includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "t" }),
          });
        }
        expect(String(url)).toContain("/v1/auth/phone");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ phone: "+254712345678" });
        return Promise.resolve({
          ok: true,
          json: async () => next,
        });
      }),
    );
    const onAuth = vi.fn();
    await persistPayPhone("712345678", null, onAuth);
    expect(onAuth).toHaveBeenCalledWith(next);
  });
});
