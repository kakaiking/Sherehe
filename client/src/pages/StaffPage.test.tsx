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

function balancedTicketTypes() {
  return [
    { code: "early_bird", name: "Early Bird", priceKsh: 2000, capacity: 125, sold: 0 },
    { code: "rush", name: "Rush Ticket", priceKsh: 2800, capacity: 50, sold: 0 },
    { code: "regular", name: "Regular Ticket", priceKsh: 3500, capacity: 25, sold: 0 },
    { code: "vip", name: "VIP Ticket", priceKsh: 4500, capacity: 20, sold: 0 },
    { code: "viip", name: "VIIP Ticket", priceKsh: 5500, capacity: 20, sold: 0 },
    { code: "group", name: "Group Ticket (5 people)", priceKsh: 13000, capacity: 10, sold: 0 },
    { code: "flash", name: "Flash Sale", priceKsh: 1500, capacity: 50, sold: 0 },
  ];
}

function overviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventName: "Sherehe",
    venue: null,
    startsAt: null,
    attendeeCount: 0,
    attendeeTarget: 200,
    flashEnabled: false,
    flashStartsAt: null,
    flashEndsAt: null,
    flashDates: [],
    canArmFlash: true,
    ticketBuyers: [],
    ticketTypes: balancedTicketTypes(),
    overview: {
      attendeeCount: 0,
      attendeeTarget: 200,
      paidTicketOrders: 0,
      ticketRevenueKsh: 0,
      partnerCount: 0,
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

function renderStaff(onLogout: () => void = () => undefined): void {
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <SnackbarProvider>
        <StaffPage
          user={staffUser}
          onAuth={() => undefined}
          onLogout={onLogout}
        />
      </SnackbarProvider>
    </MemoryRouter>,
  );
}

describe("StaffPage dashboard", () => {
  it("shows the desk title without a clock or subtitle lede", async () => {
    stubStaffFetch();
    const { container } = render(
      <MemoryRouter initialEntries={["/admin"]}>
        <SnackbarProvider>
        <StaffPage
          user={staffUser}
          onAuth={() => undefined}
          onLogout={() => undefined}
        />
      </SnackbarProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  expect(container.querySelector(".admin-clock")).toBeNull();
  expect(container.querySelector(".page-head .lede")).toBeNull();
  expect(container.querySelector(".page-head .account-name")).toBeNull();
  expect(screen.queryByText("Tap a card. Jump in.")).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "Scan" }));
  expect(await screen.findByRole("heading", { name: "Gate scan" })).toBeTruthy();
  expect(container.querySelector(".page-head .lede")).toBeNull();
  expect(screen.queryByText(/Camera check-in/i)).toBeNull();
});

  it("shows partner count on a full-width Partners card", async () => {
    stubStaffFetch({
      overview: {
        overview: {
          attendeeCount: 0,
          attendeeTarget: 200,
          paidTicketOrders: 0,
          ticketRevenueKsh: 0,
          partnerCount: 3,
        },
      },
    });
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    const partnersCard = screen
      .getAllByRole("button")
      .find((b) => b.classList.contains("admin-stat-wide") && /Partners/i.test(b.textContent ?? ""));
    expect(partnersCard).toBeTruthy();
    expect(partnersCard?.textContent).toMatch(/3/);
  });

  it("shows Scan with icon only — no Gate label or check-in hint", async () => {
    stubStaffFetch();
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    const scanCard = screen
      .getAllByRole("button")
      .find((b) => b.classList.contains("admin-stat-scan"));
    expect(scanCard).toBeTruthy();
    expect(scanCard?.textContent?.trim()).toBe("Scan");
    expect(scanCard?.querySelector(".admin-stat-scan-icon")).toBeTruthy();
    expect(screen.queryByText("Gate")).toBeNull();
    expect(screen.queryByText("Check in tickets")).toBeNull();
  });
});

describe("StaffPage dock", () => {
  it("orders Home, Attendees, Tickets, Partners, Scan, and You", async () => {
    stubStaffFetch();
    renderStaff();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Home",
      "Attendees",
      "Tickets",
      "Partners",
      "Scan",
      "You",
    ]);
  });

  it("mirrors the same desks in the desktop primary nav", async () => {
    stubStaffFetch();
    renderStaff();

    const primary = await screen.findByRole("navigation", { name: "Primary" });
    expect(
      [...primary.querySelectorAll("button")].map((b) => b.textContent?.trim()),
    ).toEqual(["Home", "Attendees", "Tickets", "Partners", "Scan", "You"]);
  });
});

describe("StaffPage You desk", () => {
  it("shows the signed-in name, email, and sign-out control", async () => {
    stubStaffFetch();
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "You" }));
    expect(await screen.findByRole("heading", { name: "Staff" })).toBeTruthy();
    expect(screen.getByText("staff@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it("signs out onto the admin gate without leaving /admin", async () => {
    const onLogout = vi.fn();
    stubStaffFetch();
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
            json: async () => overviewPayload(),
          });
        }
        if (path.includes("/v1/auth/logout")) {
          return Promise.resolve({ ok: true, status: 204 });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }),
    );
    renderStaff(onLogout);

    fireEvent.click(await screen.findByRole("tab", { name: "You" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Signed out.")).toBeTruthy();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe("StaffPage back control", () => {
  it("returns to dashboard from a desk without leaving /admin", async () => {
    stubStaffFetch();
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Attendees" }));
    expect(await screen.findByRole("heading", { name: "Attendees" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it("does not navigate away when already on dashboard", async () => {
    stubStaffFetch();
    render(
      <MemoryRouter initialEntries={["/", "/admin"]} initialIndex={1}>
        <SnackbarProvider>
          <StaffPage
            user={staffUser}
            onAuth={() => undefined}
            onLogout={() => undefined}
          />
        </SnackbarProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Admin desks" })).toBeTruthy();
  });
});

describe("StaffPage tickets and attendees", () => {
  it("shows paid buyers on the Attendees desk", async () => {
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

    fireEvent.click(await screen.findByRole("tab", { name: "Attendees" }));
    expect(await screen.findByRole("heading", { name: "Attendees" })).toBeTruthy();
    expect(screen.getByText("Amina Otieno")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Arm flash sale" })).toBeNull();
  });

  it("opens Attendees from the dashboard card", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: /Attendees\s*1\s*of 200/i }));
    expect(await screen.findByRole("heading", { name: "Attendees" })).toBeTruthy();
    expect(screen.getByText("Amina Otieno")).toBeTruthy();
  });

  it("pages attendees ten rows at a time", async () => {
    const ticketBuyers = Array.from({ length: 25 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return {
        id: `33333333-3333-4333-8333-3333333333${n}`,
        display_name: `Buyer ${n}`,
        email: `buyer${n}@example.com`,
        phone: `+2547000000${n}`,
        total_ksh: 2500,
        seats: 1,
        qty: 1,
        paid_at: "2026-09-20T10:00:00.000Z",
      };
    });
    stubStaffFetch({
      overview: {
        ticketBuyers,
        overview: {
          attendeeCount: 25,
          attendeeTarget: 200,
          paidTicketOrders: 25,
          ticketRevenueKsh: 62_500,
        },
      },
    });
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Attendees" }));
    expect(await screen.findByText("Buyer 01")).toBeTruthy();
    expect(screen.getByText("1-10 of 25")).toBeTruthy();
    expect(screen.queryByText("Buyer 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next attendees page" }));
    expect(await screen.findByText("Buyer 11")).toBeTruthy();
    expect(screen.getByText("11-20 of 25")).toBeTruthy();
    expect(screen.queryByText("Buyer 01")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next attendees page" }));
    expect(await screen.findByText("Buyer 21")).toBeTruthy();
    expect(screen.getByText("21-25 of 25")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous attendees page" }));
    expect(await screen.findByText("Buyer 11")).toBeTruthy();
    expect(screen.getByText("11-20 of 25")).toBeTruthy();
  });

  it("shows ticket-type cards and flash sale on the Tickets desk", async () => {
    stubStaffFetch({
      overview: {
        ticketTypes: [
          { code: "early_bird", name: "Early Bird", priceKsh: 2000, capacity: 125, sold: 12 },
          { code: "regular", name: "Regular Ticket", priceKsh: 3500, capacity: 25, sold: 5 },
          { code: "vip", name: "VIP Ticket", priceKsh: 4500, capacity: 20, sold: 2 },
        ],
        flashEnabled: false,
        canArmFlash: true,
      },
    });
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Tickets" }));
    expect(await screen.findByRole("heading", { name: "Tickets" })).toBeTruthy();
    expect(screen.getByText("Early Bird")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Regular Ticket")).toBeTruthy();
    expect(screen.getByText("VIP Ticket")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set flash sale" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Schedule flash sale" })).toBeNull();
    expect(screen.queryByText("Amina Otieno")).toBeNull();
  });

  it("opens flash sale settings in a modal", async () => {
    stubStaffFetch();
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Tickets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set flash sale" }));
    expect(await screen.findByRole("dialog", { name: "Flash sale" })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Flash sale days" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save flash days" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.queryByText(/Africa\/Nairobi/)).toBeNull();
    expect(screen.queryByText(/Flash sale set for/)).toBeNull();
  });

  it("asks to save or discard when closing with unsaved flash days", async () => {
    stubStaffFetch();
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Tickets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set flash sale" }));
    fireEvent.click(await screen.findByRole("gridcell", { name: /2026-09-24$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(await screen.findByRole("dialog", { name: "Save changes?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("dialog", { name: "Flash sale" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Save changes?" })).toBeNull();
  });

  it("closes flash sale modal without confirm when nothing changed", async () => {
    stubStaffFetch();
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Tickets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set flash sale" }));
    await screen.findByRole("dialog", { name: "Flash sale" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog", { name: "Flash sale" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Save changes?" })).toBeNull();
  });

  it("saves selected flash sale calendar days", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
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
          json: async () => overviewPayload(),
        });
      }
      if (path.includes("/staff/flash") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            flashEnabled: true,
            flashDates: ["2026-09-24"],
            flashStartsAt: "2026-09-23T21:00:00.000Z",
            flashEndsAt: "2026-09-24T20:59:59.999Z",
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderStaff();

    fireEvent.click(await screen.findByRole("tab", { name: "Tickets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set flash sale" }));
    fireEvent.click(await screen.findByRole("gridcell", { name: /2026-09-24$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save flash days" }));

    await screen.findByText(/Flash sale days saved/i);
    const flashCall = fetchMock.mock.calls.find(
      ([u, init]) =>
        String(u).includes("/staff/flash") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(flashCall).toBeTruthy();
    expect(JSON.parse(String((flashCall?.[1] as RequestInit).body))).toEqual({
      dates: ["2026-09-24"],
    });
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
