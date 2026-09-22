import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider } from "../snackbar";
import { StaffPage } from "./StaffPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const staffUser = {
  id: "staff-1",
  email: "staff@example.com",
  phone: null,
  role: "staff" as const,
  displayName: "Staff",
  givenName: "Staff",
};

function overviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventName: "Sherehe",
    venue: null,
    startsAt: null,
    attendeeCount: 0,
    attendeeTarget: 200,
    flashEnabled: false,
    flashEndsAt: null,
    canArmFlash: true,
    ticketBuyers: [],
    overview: {
      attendeeCount: 0,
      attendeeTarget: 200,
      paidTicketOrders: 0,
      ticketRevenueKsh: 0,
    },
    ...overrides,
  };
}

function stubStaffFetch(options?: { overview?: Record<string, unknown> }): void {
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
      if (path.includes("/staff/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => overviewPayload(options?.overview),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    }),
  );
}

function renderStaff(): void {
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <SnackbarProvider>
        <StaffPage user={staffUser} onAuth={() => undefined} />
      </SnackbarProvider>
    </MemoryRouter>,
  );
}

describe("StaffPage dock", () => {
  it("orders Home, Tickets, and Scan like the guest dock", async () => {
    stubStaffFetch();
    renderStaff();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Home", "Tickets", "Scan"]);
  });
});

describe("StaffPage back control", () => {
  it("returns to dashboard from a desk without leaving /admin", async () => {
    stubStaffFetch();
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Tickets" }));
    expect(await screen.findByRole("heading", { name: "Tickets ordered" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it("does not navigate away when already on dashboard", async () => {
    stubStaffFetch();
    render(
      <MemoryRouter initialEntries={["/", "/admin"]} initialIndex={1}>
        <SnackbarProvider>
          <StaffPage user={staffUser} onAuth={() => undefined} />
        </SnackbarProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Admin desks" })).toBeTruthy();
  });
});

describe("StaffPage tickets and event", () => {
  it("shows ticket buyers from the Tickets desk, not product stock", async () => {
    stubStaffFetch({
      overview: {
        ticketBuyers: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            display_name: "Amina Otieno",
            email: "amina@example.com",
            phone: "+254700000001",
            total_ksh: 2500,
            seats: 1,
            qty: 1,
            paid_at: "2026-09-20T10:00:00.000Z",
          },
        ],
        overview: {
          attendeeCount: 1,
          attendeeTarget: 200,
          paidTicketOrders: 1,
          ticketRevenueKsh: 2500,
        },
      },
    });
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Tickets" }));
    expect(await screen.findByRole("heading", { name: "Tickets ordered" })).toBeTruthy();
    expect(screen.getByText("Amina Otieno")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Product stock" })).toBeNull();
    expect(screen.queryByText("Nyama choma")).toBeNull();
  });

  it("opens flash sale from Attendees, not as a dock tab", async () => {
    stubStaffFetch();
    renderStaff();

    expect(screen.queryByRole("tab", { name: "Event" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Attendees/i }));
    expect(await screen.findByRole("heading", { name: "Event" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Arm flash sale" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Product stock" })).toBeNull();
    expect(screen.queryByText(/Nyama choma/)).toBeNull();
  });

  it("opens the gate Scan desk with camera controls and history", async () => {
    const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const fetchMock = vi.fn((url: string) => {
      const path = String(url);
      if (path.includes("/csrf")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrfToken: "test-csrf" }),
        });
      }
      if (path.includes("/staff/tickets/scans")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            scans: [
              {
                publicId: id,
                code: "early_bird",
                label: "Early Bird",
                holderName: "Amina Otieno",
                usedAt: "2026-09-21T12:00:00.000Z",
              },
            ],
          }),
        });
      }
      if (path.includes("/staff/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => overviewPayload(),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    expect(await screen.findByRole("heading", { name: "Gate scan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh history" })).toBeTruthy();
    expect(screen.queryByLabelText(/paste QR link/i)).toBeNull();
    expect(screen.queryByText(/Live QR scan needs a browser/i)).toBeNull();
    expect(await screen.findByRole("heading", { name: "History" })).toBeTruthy();
    expect(await screen.findByText("Amina Otieno")).toBeTruthy();
    expect(screen.getByText(/Early Bird/)).toBeTruthy();
    expect(screen.getByText("1-1 of 1")).toBeTruthy();
  });

  it("pages scan history ten rows at a time", async () => {
    const scans = Array.from({ length: 25 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return {
        publicId: `${"a".repeat(30)}${n}`,
        code: "early_bird",
        label: "Early Bird",
        holderName: `Guest ${n}`,
        usedAt: "2026-09-21T12:00:00.000Z",
      };
    });
    const fetchMock = vi.fn((url: string) => {
      const path = String(url);
      if (path.includes("/csrf")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrfToken: "test-csrf" }),
        });
      }
      if (path.includes("/staff/tickets/scans")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ scans }),
        });
      }
      if (path.includes("/staff/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => overviewPayload(),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    expect(await screen.findByText("Guest 01")).toBeTruthy();
    expect(screen.getByText("1-10 of 25")).toBeTruthy();
    expect(screen.queryByText("Guest 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next history page" }));
    expect(await screen.findByText("Guest 11")).toBeTruthy();
    expect(screen.getByText("11-20 of 25")).toBeTruthy();
    expect(screen.queryByText("Guest 01")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next history page" }));
    expect(await screen.findByText("Guest 21")).toBeTruthy();
    expect(screen.getByText("21-25 of 25")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous history page" }));
    expect(await screen.findByText("Guest 11")).toBeTruthy();
    expect(screen.getByText("11-20 of 25")).toBeTruthy();
  });
});
