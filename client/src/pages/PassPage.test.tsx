import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PassPage } from "./PassPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const sig =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("PassPage", () => {
  it("shows a ready pass without implying check-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes(`/passes/${id}`)) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: "issued",
              code: "early_bird",
              label: "Early Bird",
              holderName: "Amina Otieno",
              eventName: "Sherehe",
              venue: "Fused Lens",
              startsAt: "2026-11-28T13:00:00.000Z",
              usedAt: null,
              readyForGate: true,
              headline: "Valid pass",
              detail:
                "This Sherehe pass is ready for the gate. Only staff check-in counts — opening this page does not mark you as entered.",
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    render(
      <MemoryRouter initialEntries={[`/pass/${id}?sig=${sig}`]}>
        <Routes>
          <Route path="/pass/:publicId" element={<PassPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Valid pass")).toBeTruthy();
    expect(screen.getByText(/does not mark you as entered/i)).toBeTruthy();
    expect(screen.getByText("Early Bird")).toBeTruthy();
    expect(screen.getByText("Amina Otieno")).toBeTruthy();
  });

  it("surfaces an incomplete link", async () => {
    render(
      <MemoryRouter initialEntries={[`/pass/${id}`]}>
        <Routes>
          <Route path="/pass/:publicId" element={<PassPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/incomplete/i)).toBeTruthy();
    });
  });
});
