import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
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

describe("guest portal dock", () => {
  it("hides the top site header on guest home but keeps the dock", async () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/guest"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Sherehe" })).toBeTruthy();
    expect(document.querySelector(".site-header")).toBeNull();
    const dock = screen.getByRole("navigation", { name: "Main" });
    const labels = [...dock.querySelectorAll("a")].map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Home", "Tickets", "Partners"]);
  });

  it("has home, tickets, and partners when signed out — no sign-in chrome", () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/guest/tickets"]}>
        <App />
      </MemoryRouter>,
    );
    const dock = screen.getByRole("navigation", { name: "Main" });
    const labels = [...dock.querySelectorAll("a")].map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Home", "Tickets", "Partners"]);
    expect(screen.queryByRole("link", { name: /^sign in$/i })).toBeNull();
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(
      [...primary.querySelectorAll("a")].map((a) => a.textContent?.trim()),
    ).toEqual(["Home", "Tickets", "Partners"]);
  });

  it("hides the main dock on admin portal routes", () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("keeps the brand on /admin and hides guest primary nav when signed out", () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Sherehe/i }).getAttribute("href")).toBe(
      "/admin",
    );
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });

  it("shows guest home content under /guest", async () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/guest"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Sherehe" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /grab a plate/i }).getAttribute("href")).toBe(
      "/guest/tickets",
    );
  });

  it("sends former vendor routes to guest home", async () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/vendor/shop"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Sherehe" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });
});

describe("unknown routes", () => {
  it("sends bare / to guest home", async () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Sherehe" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("sends legacy paths to guest home", async () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/shop"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Sherehe" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("sends unknown guest subpaths to guest home", async () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/guest/nope"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Sherehe" })).toBeTruthy();
  });
});
