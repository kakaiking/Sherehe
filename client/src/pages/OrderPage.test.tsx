import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider } from "../snackbar";
import { OrderPage } from "./OrderPage";

const paid = {
  id: "11111111-2222-3333-4444-555555555555",
  kind: "tickets",
  status: "paid",
  totalKsh: 2000,
  mpesaReceipt: null,
  items: [],
  tickets: [
    {
      publicId: "abcdef12deadbeef",
      signature: "sig",
      qrDataUrl: "data:image/png;base64,aaa",
      code: "early_bird",
      holderName: "Walter Kamau",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OrderPage ticket stub", () => {
  it("opens tickets right away, downloads in the background, then snackbars success", async () => {
    let resolvePdf!: (value: {
      ok: boolean;
      blob: () => Promise<Blob>;
    }) => void;
    const pdfReady = new Promise<{
      ok: boolean;
      blob: () => Promise<Blob>;
    }>((resolve) => {
      resolvePdf = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tickets.pdf")) {
        return pdfReady;
      }
      return Promise.resolve({
        ok: true,
        json: async () => paid,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:ticket");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={[`/guest/orders/${paid.id}`]}>
        <SnackbarProvider>
          <Routes>
            <Route path="/guest/orders/:id" element={<OrderPage />} />
            <Route path="/guest/tickets" element={<p>Tickets screen</p>} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Your tickets" })).toBeTruthy();
    expect(screen.getByText("Early Bird")).toBeTruthy();
    expect(screen.getByText("the pit is open")).toBeTruthy();
    expect(screen.getByText("Walter Kamau")).toBeTruthy();
    expect(screen.getByText(/Sat,\s*28\s*Nov\s*2026/i)).toBeTruthy();
    expect(screen.getByText(/Fused Lens Studios/i)).toBeTruthy();
    expect(screen.getByText(/Kirigiti,\s*Kiambu/i)).toBeTruthy();
    expect(screen.getByText("Gate scan")).toBeTruthy();
    expect(screen.queryByText(/abcdef12/)).toBeNull();
    const download = await screen.findByRole("button", { name: "Download ticket" });
    fireEvent.click(download);
    expect(await screen.findByText("Tickets screen")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    resolvePdf({
      ok: true,
      blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    });
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/tickets.pdf")),
      ).toBe(true);
    });
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Ticket downloaded.");
  });
});
