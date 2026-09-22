import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PartnersPage } from "./PartnersPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubPartners(partners: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const path = String(url);
      if (path.includes("/catalog/partners") && !path.includes("/logo")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ partners }),
          text: async () => JSON.stringify({ partners }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        text: async () => "{}",
      });
    }),
  );
}

describe("PartnersPage", () => {
  it("shows an empty invite when there are no partners", async () => {
    stubPartners([]);
    render(
      <MemoryRouter>
        <PartnersPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Partners" })).toBeTruthy();
    expect(
      screen.getByText(/partner lineup coming soon/i),
    ).toBeTruthy();
  });

  it("renders stall actions and alternates flip for the second partner", async () => {
    stubPartners([
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "First Co",
        description: "Does plates",
        phone: "254712345678",
        email: "a@test.example",
        sortOrder: 0,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Second Co",
        description: "Does sauce",
        phone: "254798765432",
        email: "b@test.example",
        sortOrder: 1,
      },
    ]);
    const { container } = render(
      <MemoryRouter>
        <PartnersPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "First Co" })).toBeTruthy();
    const stalls = container.querySelectorAll(".partners-stall");
    expect(stalls).toHaveLength(2);
    expect(stalls[0]?.classList.contains("partners-stall--flip")).toBe(false);
    expect(stalls[1]?.classList.contains("partners-stall--flip")).toBe(true);
    expect(
      screen.getByRole("link", { name: /call first co/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /email first co/i }),
    ).toBeTruthy();
    expect(screen.getAllByText("Crew")).toHaveLength(2);
  });
});
