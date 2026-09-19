import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../App";
import { SnackbarProvider } from "../snackbar";
import { TicketsPage } from "./TicketsPage";

const guest = null;
const signedIn: User = {
  id: "u1",
  email: "guest@example.com",
  phone: "+254700000000",
  role: "customer",
  displayName: "Guest Example",
  givenName: "Guest",
};

function catalogOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          offerings: [
            {
              code: "early_bird",
              name: "Early Bird",
              priceKsh: 2000,
              seatsPerUnit: 1,
              remainingUnits: 10,
            },
            {
              code: "group",
              name: "Group Ticket (5 people)",
              priceKsh: 13000,
              seatsPerUnit: 5,
              remainingUnits: 4,
            },
          ],
        }),
      }),
    ),
  );
}

function renderTickets(user: User | null, entry = "/tickets"): ReturnType<typeof render> {
  const entries = entry === "/tickets" ? ["/", "/tickets"] : ["/", entry];
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={1}>
      <SnackbarProvider>
        <Routes>
          <Route path="/" element={<p>Home screen</p>} />
          <Route path="/tickets" element={<TicketsPage user={user} />} />
          <Route path="/login" element={<p>Sign in screen</p>} />
          <Route path="/orders/:id" element={<p>Paid stub</p>} />
          <Route path="/shop" element={<p>Shop screen</p>} />
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

describe("TicketsPage stepped checkout", () => {
  it("hides quantity until a signed-in guest picks a ticket", async () => {
    catalogOk();
    renderTickets(signedIn);
    await screen.findByRole("button", { name: /Early Bird/ });
    expect(screen.queryByLabelText("Quantity")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Early Bird/ }));
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
    expect((screen.getByLabelText("Ticket") as HTMLInputElement).readOnly).toBe(
      true,
    );
    expect((screen.getByLabelText("Ticket") as HTMLInputElement).value).toMatch(
      /Early Bird/,
    );
  });

  it("sends a signed-out pick to sign-in and stores resume", async () => {
    catalogOk();
    renderTickets(guest);
    await screen.findByRole("button", { name: /Early Bird/ });
    fireEvent.click(screen.getByRole("button", { name: /Early Bird/ }));
    expect(screen.getByText("Sign in screen")).toBeTruthy();
    expect(sessionStorage.getItem("sherehe.continuePath")).toBe(
      "/tickets?pick=early_bird",
    );
  });

  it("resumes quantity for a signed-in visitor with ?pick=", async () => {
    catalogOk();
    renderTickets(signedIn, "/tickets?pick=group");
    const ticket = await screen.findByLabelText("Ticket");
    expect((ticket as HTMLInputElement).value).toBe("Group Ticket (5 people)");
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
  });

  it("does not append a seats suffix to the group ticket label", async () => {
    catalogOk();
    renderTickets(signedIn);
    const card = await screen.findByRole("button", {
      name: /Group Ticket \(5 people\)/,
    });
    expect(card.textContent).not.toMatch(/seats/i);
  });

  it("puts a left-arrow back control on the pick step that returns home", async () => {
    catalogOk();
    renderTickets(signedIn);
    await screen.findByRole("button", { name: /Early Bird/ });
    expect(screen.queryByRole("button", { name: "Pay" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Home screen")).toBeTruthy();
  });

  it("returns from quantity to the ticket list via the header arrow", async () => {
    catalogOk();
    renderTickets(signedIn);
    fireEvent.click(await screen.findByRole("button", { name: /Early Bird/ }));
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pay" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /Early Bird/ })).toBeTruthy();
    expect(screen.queryByLabelText("Quantity")).toBeNull();
  });

  it("pays with the sign-up number and opens the stub", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/v1/catalog/tickets")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            offerings: [
              {
                code: "early_bird",
                name: "Early Bird",
                priceKsh: 2000,
                seatsPerUnit: 1,
                remainingUnits: 10,
              },
            ],
          }),
        });
      }
      if (url.includes("/v1/account/ticket-pass")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ hasTicket: false }),
        });
      }
      if (url.includes("/v1/orders/tickets") && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual({
          code: "early_bird",
          qty: 1,
        });
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            orderId: "11111111-2222-3333-4444-555555555555",
          }),
        });
      }
      if (url.includes("/stk-query") && method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "paid" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ csrfToken: "t" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderTickets(signedIn);
    fireEvent.click(await screen.findByRole("button", { name: /Early Bird/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    expect(screen.getByText("Early Bird × 1")).toBeTruthy();
    expect(screen.queryByLabelText("Ticket")).toBeNull();
    expect(
      (screen.getByLabelText("M-Pesa number") as HTMLInputElement).value,
    ).toBe("700 000 000");
    const send = screen.getByRole("button", { name: "Receive Prompt" });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    expect(await screen.findByText("Paid stub")).toBeTruthy();
  });

  it("asks before a second M-Pesa prompt when a stub was already downloaded", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/v1/catalog/tickets")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            offerings: [
              {
                code: "early_bird",
                name: "Early Bird",
                priceKsh: 2000,
                seatsPerUnit: 1,
                remainingUnits: 10,
              },
            ],
          }),
        });
      }
      if (url.includes("/v1/account/ticket-pass")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ hasTicket: true }),
        });
      }
      if (url.includes("/v1/orders/tickets") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            orderId: "11111111-2222-3333-4444-555555555555",
          }),
        });
      }
      if (url.includes("/stk-query") && method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "paid" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ csrfToken: "t" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderTickets(signedIn);
    fireEvent.click(await screen.findByRole("button", { name: /Early Bird/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    fireEvent.click(screen.getByRole("button", { name: "Receive Prompt" }));
    expect(
      await screen.findByRole("heading", {
        name: "Are you sure you want another ticket?",
      }),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        (c) =>
          String(c[0]).includes("/v1/orders/tickets") &&
          (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Paid stub")).toBeTruthy();
  });

  it("collects the M-Pesa number on Receive Prompt when none is saved", async () => {
    const noPhone: User = { ...signedIn, phone: null };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/v1/catalog/tickets")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            offerings: [
              {
                code: "early_bird",
                name: "Early Bird",
                priceKsh: 2000,
                seatsPerUnit: 1,
                remainingUnits: 10,
              },
            ],
          }),
        });
      }
      if (url.includes("/v1/auth/phone") && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual({ phone: "+254712345678" });
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...noPhone, phone: "254712345678" }),
        });
      }
      if (url.includes("/v1/account/ticket-pass")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ hasTicket: false }),
        });
      }
      if (url.includes("/v1/orders/tickets") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            orderId: "11111111-2222-3333-4444-555555555555",
          }),
        });
      }
      if (url.includes("/stk-query") && method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "paid" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ csrfToken: "t" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderTickets(noPhone);
    fireEvent.click(await screen.findByRole("button", { name: /Early Bird/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    const send = screen.getByRole("button", { name: "Receive Prompt" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("M-Pesa number"), {
      target: { value: "712345678" },
    });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    expect(await screen.findByText("Paid stub")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        (c) =>
          String(c[0]).includes("/v1/auth/phone") &&
          (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(true);
  });
});
