import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const path = String(url);
      if (path.includes("/csrf")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrfToken: "test-csrf" }),
        });
      }
      if (path.includes("/auth/me")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ detail: "unauth" }),
        });
      }
      if (path.includes("/catalog/event")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: "Sherehe",
            presenter: "Food With Walter Kenya",
            venue: "Nairobi",
            startsAt: "2026-12-06T13:00:00.000Z",
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          attendeeCount: 12,
          attendeeTarget: 200,
          offerings: [],
        }),
      });
    }),
  );
}

describe("bottom dock", () => {
  it("has home, tickets, shop, and sign in — no More sheet", () => {
    stubFetch();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const dock = screen.getByRole("navigation", { name: "Main" });
    expect(dock.textContent).toContain("Home");
    expect(dock.textContent).toContain("Tickets");
    expect(dock.textContent).toContain("Shop");
    expect(dock.textContent).toContain("Sign in");
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "The rest of the pit" })).toBeNull();
  });
});
