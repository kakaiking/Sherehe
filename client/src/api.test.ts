import { describe, expect, it } from "vitest";
import { formatKsh, parseJsonBody } from "./api";

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
