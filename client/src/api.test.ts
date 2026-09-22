import { afterEach, describe, expect, it, vi } from "vitest";
import { api, downloadPdf, formatKsh, parseJsonBody } from "./api";
import { PORTAL_HEADER, storePortal } from "./portal";

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("formatKsh", () => {
  it("formats Kenyan shillings with a grouping separator", () => {
    expect(formatKsh(3500)).toMatch(/KSh/);
    expect(formatKsh(3500)).toMatch(/3/);
  });
});

describe("parseJsonBody", () => {
  it("returns null for Vercel FUNCTION_INVOCATION_FAILED text", async () => {
    const res = new Response("A server error has occurred\n\nFUNCTION_INVOCATION_FAILED\n", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
    expect(await parseJsonBody(res)).toBeNull();
  });

  it("parses JSON objects", async () => {
    const res = new Response(JSON.stringify({ attendeeCount: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    expect(await parseJsonBody(res)).toEqual({ attendeeCount: 0 });
  });

  it("falls back to json() for fetch test doubles", async () => {
    const res = { json: async () => ({ csrfToken: "t" }) } as unknown as Response;
    expect(await parseJsonBody(res)).toEqual({ csrfToken: "t" });
  });
});

describe("api portal header", () => {
  it("sends X-Sherehe-Portal from the stored gate", async () => {
    storePortal("admin");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await api<{ ok: boolean }>("/v1/auth/me");
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    const headers = new Headers(init?.headers);
    expect(headers.get(PORTAL_HEADER)).toBe("admin");
  });
});

describe("downloadPdf", () => {
  it("saves as an octet-stream attachment without opening a viewer page", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([37, 80, 68, 70]), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      ),
    );
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        expect(blob).toBeInstanceOf(Blob);
        expect((blob as Blob).type).toBe("application/octet-stream");
        return "blob:ticket-pdf";
      });
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const clicked: Array<{ href: string; download: string }> = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = realCreate(tagName);
      if (tagName === "a") {
        const anchor = el as HTMLAnchorElement;
        anchor.click = () => {
          clicked.push({ href: anchor.href, download: anchor.download });
        };
      }
      return el;
    });

    await downloadPdf("/v1/orders/x/tickets.pdf", "sherehe-tickets.pdf");

    expect(clicked).toEqual([
      { href: "blob:ticket-pdf", download: "sherehe-tickets.pdf" },
    ]);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ticket-pdf");
  });
});
