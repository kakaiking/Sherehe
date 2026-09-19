import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../App";
import { SnackbarProvider } from "../snackbar";
import { ShopPage } from "./ShopPage";

const guest: User = {
  id: "u1",
  email: "a@example.com",
  phone: "+254700000000",
  role: "customer",
  displayName: "Ada",
  givenName: "Ada",
};

const vendor: User = { ...guest, role: "vendor" };

function plates(n: number): Array<{
  slug: string;
  name: string;
  description: string;
  price_ksh: number;
  stock: number;
}> {
  return Array.from({ length: n }, (_, i) => ({
    slug: `plate-${i + 1}`,
    name: `Plate ${i + 1}`,
    description: "Food",
    price_ksh: 500 + i,
    stock: 10,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("ShopPage guest catalog", () => {
  it("shows nine plates and a page bar, then quantity after a tap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const path = String(url);
        if (path.includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "t" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            products: plates(9),
            page: 1,
            pageSize: 9,
            total: 12,
            pages: 2,
          }),
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={["/shop"]}>
        <SnackbarProvider>
          <Routes>
            <Route path="/shop" element={<ShopPage user={guest} />} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: /Plate 1/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Plate / })).toHaveLength(9);
    expect(screen.getByRole("navigation", { name: "Plate pages" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Plate 1/ }));
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
  });

  it("opens quantity when a signed-in guest lands with ?pick=", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            products: plates(1),
            page: 1,
            pageSize: 9,
            total: 1,
            pages: 1,
          }),
        }),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/shop?pick=plate-1"]}>
        <SnackbarProvider>
          <Routes>
            <Route path="/shop" element={<ShopPage user={guest} />} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("Quantity")).toBeTruthy();
    expect(screen.getByLabelText("Plate")).toBeTruthy();
  });
});

describe("ShopPage vendor catalog", () => {
  it("opens sales records instead of checkout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const path = String(url);
        if (path.includes("/sales")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              product: plates(1)[0],
              sales: [
                {
                  order_id: "ord-1",
                  status: "paid",
                  total_ksh: 1000,
                  paid_at: "2026-09-18T08:50:00.000Z",
                  created_at: "2026-09-18T08:50:00.000Z",
                  qty: 2,
                  unit_price_ksh: 500,
                  display_name: "Ada Lovelace",
                  email: "ada@example.com",
                  phone: "254700000000",
                  receipt: "MOCK1234",
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            products: plates(1),
            page: 1,
            pageSize: 9,
            total: 1,
            pages: 1,
          }),
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={["/shop"]}>
        <SnackbarProvider>
          <Routes>
            <Route path="/shop" element={<ShopPage user={vendor} />} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Add a plate" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Plate 1/ }));
    expect(await screen.findByRole("heading", { name: "Plate 1" })).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.getByText(/MOCK1234/)).toBeTruthy();
    expect(screen.queryByLabelText("Quantity")).toBeNull();
  });
});
