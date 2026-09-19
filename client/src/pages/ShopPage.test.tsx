import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../App";
import { resetLocalCache } from "../cache/queryCache";
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

const STALL_ID = "11111111-1111-4111-8111-111111111111";

function meals(n: number): Array<{
  slug: string;
  name: string;
  description: string;
  price_ksh: number;
  stock: number;
}> {
  return Array.from({ length: n }, (_, i) => ({
    slug: `meal-${i + 1}`,
    name: `Meal ${i + 1}`,
    description: "Food",
    price_ksh: 500 + i,
    stock: 10,
  }));
}

function jsonOk(body: unknown): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetLocalCache();
});

describe("ShopPage guest catalog", () => {
  it("shows stalls, then nine meals and a page bar, then quantity after a tap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const path = String(url);
        if (path.includes("/csrf")) {
          return jsonOk({ csrfToken: "t" });
        }
        if (path.includes("/stalls")) {
          return jsonOk({
            stalls: [{ id: STALL_ID, name: "Pit Side", meal_count: 12 }],
          });
        }
        return jsonOk({
          products: meals(9),
          page: 1,
          pageSize: 9,
          total: 12,
          pages: 2,
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
    expect(await screen.findByRole("heading", { name: "Vendors" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Pit Side/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Pit Side/ }));
    expect(await screen.findByRole("button", { name: /Meal 1/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Meal / })).toHaveLength(9);
    expect(screen.getByRole("navigation", { name: "Meal pages" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Meal 1/ }));
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
  });

  it("opens quantity when a signed-in guest lands with vendor and pick", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const path = String(url);
        if (path.includes("/csrf")) {
          return jsonOk({ csrfToken: "t" });
        }
        if (path.includes("/stalls")) {
          return jsonOk({
            stalls: [{ id: STALL_ID, name: "Pit Side", meal_count: 1 }],
          });
        }
        return jsonOk({
          products: meals(1),
          page: 1,
          pageSize: 9,
          total: 1,
          pages: 1,
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={[`/shop?vendor=${STALL_ID}&pick=meal-1`]}>
        <SnackbarProvider>
          <Routes>
            <Route path="/shop" element={<ShopPage user={guest} />} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("Quantity")).toBeTruthy();
    expect(screen.getByLabelText("Meal")).toBeTruthy();
  });
});

describe("ShopPage vendor catalog", () => {
  it("opens sales records instead of checkout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const path = String(url);
        if (path.includes("/csrf")) {
          return jsonOk({ csrfToken: "t" });
        }
        if (path.includes("/sales")) {
          return jsonOk({
            product: meals(1)[0],
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
          });
        }
        return jsonOk({
          products: meals(1),
          page: 1,
          pageSize: 9,
          total: 1,
          pages: 1,
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
    expect(await screen.findByRole("button", { name: "Add a meal" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Meal 1/ }));
    expect(await screen.findByRole("heading", { name: "Meal 1" })).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.getByText(/MOCK1234/)).toBeTruthy();
    expect(screen.queryByLabelText("Quantity")).toBeNull();
  });
});
