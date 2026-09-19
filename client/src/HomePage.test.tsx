import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { HomePage } from "./pages/HomePage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("has no serious axe violations in the listing state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/event")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              name: "Sherehe",
              presenter: "Food With Walter Kenya",
              venue: "Fused Lens Studios, Kirigiti, Kiambu",
              startsAt: "2026-11-28T13:00:00.000Z",
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            attendeeCount: 12,
            attendeeTarget: 200,
            offerings: [
              { code: "regular", name: "Regular Ticket", priceKsh: 3500 },
            ],
          }),
        });
      }),
    );
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Regular Ticket");
    });
    expect(container.textContent).toMatch(/Fused Lens/);
    expect(container.textContent).toMatch(/Kirigiti/);
    expect(container.textContent).toMatch(/28/);
    const results = await axe.run(container);
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
});
