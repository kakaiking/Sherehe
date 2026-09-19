import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../App";
import { SnackbarProvider } from "../snackbar";
import { VendorsPage } from "./VendorsPage";

const signedIn: User = {
  id: "u1",
  email: "guest@example.com",
  phone: "+254700000000",
  role: "customer",
  displayName: "Guest Example",
  givenName: "Guest",
};

function packagesOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          packages: [
            {
              code: "stall_prem",
              name: "Premium stall",
              category_hint: "Food or beverage",
              space_description: "6×3 m, two tables, power, shared lighting",
              fee_ksh: 28000,
              setup_time: "Day-of 07:00–10:00",
              operating_hours: "10:00–22:00",
              payment_deadline: "2026-11-02T04:45:15.000Z",
              rules: "Staff must follow the same waste and fire rules as standard stalls.",
            },
          ],
        }),
      }),
    ),
  );
}

function renderVendors(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/", "/vendors"]} initialIndex={1}>
      <SnackbarProvider>
        <Routes>
          <Route path="/" element={<p>Home screen</p>} />
          <Route path="/vendors" element={<VendorsPage user={signedIn} />} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("VendorsPage package cards", () => {
  it("lists each stall as labeled facts, not a single paragraph", async () => {
    packagesOk();
    renderVendors();
    expect(await screen.findByRole("button", { name: /Premium stall/ })).toBeTruthy();
    expect(screen.getByText("Food or beverage")).toBeTruthy();
    expect(screen.getByText("6×3 m, two tables, power, shared lighting")).toBeTruthy();
    expect(screen.getByText("Set-up")).toBeTruthy();
    expect(screen.getByText("Day-of 07:00–10:00")).toBeTruthy();
    expect(screen.getByText("Hours")).toBeTruthy();
    expect(screen.getByText("10:00–22:00")).toBeTruthy();
    expect(screen.getByText("Pay by")).toBeTruthy();
    expect(screen.getByText(/2 Nov 2026/)).toBeTruthy();
    expect(
      screen.getByText(/waste and fire rules/),
    ).toBeTruthy();
    expect(screen.queryByText(/Set-up Day-of/)).toBeNull();
  });

  it("locks the package after a tap and shows the details form", async () => {
    packagesOk();
    renderVendors();
    fireEvent.click(await screen.findByRole("button", { name: /Premium stall/ }));
    expect((screen.getByLabelText("Package") as HTMLInputElement).value).toBe(
      "Premium stall",
    );
    expect(screen.getByLabelText("Vendor category")).toBeTruthy();
  });
});
