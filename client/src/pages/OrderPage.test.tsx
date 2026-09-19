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
});

describe("OrderPage ticket stub", () => {
  it("is step four and downloads the PDF stub", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tickets.pdf")) {
        return Promise.resolve({
          ok: true,
          blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        });
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
      <MemoryRouter initialEntries={[`/orders/${paid.id}`]}>
        <SnackbarProvider>
          <Routes>
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/shop" element={<p>Shop screen</p>} />
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
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/tickets.pdf")),
      ).toBe(true);
    });
    expect(await screen.findByText("Shop screen")).toBeTruthy();
  });
});

describe("OrderPage meal receipt", () => {
  it("is shop step four and downloads the receipt into records", async () => {
    const paidMeal = {
      id: "11111111-2222-3333-4444-555555555555",
      kind: "product",
      status: "paid",
      totalKsh: 1200,
      mpesaReceipt: "MOCKABCD",
      items: [{ title: "Nyama choma", qty: 1 }],
      tickets: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/receipt.pdf")) {
        return Promise.resolve({
          ok: true,
          blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => paidMeal,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:receipt");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={[`/orders/${paidMeal.id}`]}>
        <SnackbarProvider>
          <Routes>
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/account" element={<p>Records screen</p>} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Your receipt" })).toBeTruthy();
    expect(screen.getByText(/Nyama choma/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Download receipt" }));
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/receipt.pdf")),
      ).toBe(true);
    });
    expect(await screen.findByText("Records screen")).toBeTruthy();
  });
});
