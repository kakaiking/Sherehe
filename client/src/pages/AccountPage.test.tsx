import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../App";
import { SnackbarProvider } from "../snackbar";
import { AccountPage } from "./AccountPage";

const user: User = {
  id: "u1",
  email: "kakaiteclimited@gmail.com",
  phone: "+254704551241",
  role: "customer",
  displayName: "Walter Kamau",
  givenName: "Walter",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountPage history", () => {
  it("shows the Google name, ticket type, and purchase time without paid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            orders: [
              {
                id: "ord-1",
                kind: "tickets",
                status: "paid",
                total_ksh: 2000,
                created_at: "2026-09-18T08:50:00.000Z",
                occurred_at: "2026-09-18T08:50:00.000Z",
                title: "Early Bird",
                sku_code: "early_bird",
                qty: 1,
              },
            ],
          }),
        }),
      ),
    );
    render(
      <MemoryRouter>
        <SnackbarProvider>
          <AccountPage user={user} onLogout={() => undefined} />
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Walter Kamau")).toBeTruthy();
    expect(screen.getByText(/kakaiteclimited@gmail.com/)).toBeTruthy();
    expect(screen.queryByText(/Signed in as/i)).toBeNull();
    expect(screen.getByText("Early Bird")).toBeTruthy();
    expect(screen.getByText(/11:50/)).toBeTruthy();
    expect(screen.queryByText(/paid/i)).toBeNull();
  });

  it("sends a signed-out visitor to sign in instead of a holding page", () => {
    render(
      <MemoryRouter initialEntries={["/guest/account"]}>
        <SnackbarProvider>
          <Routes>
            <Route
              path="/guest/account"
              element={
                <AccountPage user={null} onLogout={() => undefined} />
              }
            />
            <Route path="/login" element={<p>Continue with Google</p>} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.queryByText(/to see bookings/)).toBeNull();
  });

  it("signs out onto guest Home", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/auth/logout")) {
          return Promise.resolve({ ok: true, status: 204 });
        }
        if (url.includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "t" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ orders: [] }),
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={["/guest/account"]}>
        <SnackbarProvider>
          <Routes>
            <Route
              path="/guest/account"
              element={
                <AccountPage user={user} onLogout={() => undefined} />
              }
            />
            <Route path="/guest" element={<h1>Home</h1>} />
            <Route path="/login" element={<h1>Sign in</h1>} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeTruthy();
    expect(screen.getByText("Signed out.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });

  it("does not offer an Admin shortcut on Guest You for staff", async () => {
    const staff: User = {
      ...user,
      role: "staff",
      email: "kakaiphil@gmail.com",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ orders: [] }),
        }),
      ),
    );
    render(
      <MemoryRouter>
        <SnackbarProvider>
          <AccountPage user={staff} onLogout={() => undefined} />
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Admin$/i })).toBeNull();
  });
});
