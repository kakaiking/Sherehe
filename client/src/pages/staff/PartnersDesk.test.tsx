import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider } from "../../snackbar";
import { PartnersDesk } from "./PartnersDesk";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubDeskFetch(partners: unknown[] = []): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes("/csrf")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrfToken: "test-csrf" }),
          text: async () => JSON.stringify({ csrfToken: "test-csrf" }),
        });
      }
      if (path.includes("/staff/event-partners") && (!init?.method || init.method === "GET")) {
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

describe("PartnersDesk", () => {
  it("requires a logo when adding a partner", async () => {
    stubDeskFetch([]);
    render(
      <SnackbarProvider>
        <PartnersDesk uid="staff-1" />
      </SnackbarProvider>,
    );

    expect(await screen.findByText(/no partners yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add partner" }));

    fireEvent.change(screen.getByLabelText(/^Name$/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/^Description$/i), {
      target: { value: "Makes plates for the night." },
    });
    fireEvent.change(screen.getByLabelText(/Kenyan mobile/i), {
      target: { value: "712345678" },
    });
    fireEvent.change(screen.getByLabelText(/^Email$/i), {
      target: { value: "hi@acme.test" },
    });

    const submit = screen
      .getAllByRole("button", { name: "Add partner" })
      .find((b) => (b as HTMLButtonElement).type === "submit");
    expect(submit).toBeTruthy();
    fireEvent.click(submit!);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/logo/i);
    });
  });
});
