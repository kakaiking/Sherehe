import { describe, expect, it } from "vitest";
import { ticketPassUrl } from "./passUrl.js";

describe("ticketPassUrl", () => {
  it("builds a /pass URL with the signature query", () => {
    const id = "a".repeat(32);
    const sig = "b".repeat(64);
    expect(ticketPassUrl("https://sherehe.example", id, sig)).toBe(
      `https://sherehe.example/pass/${id}?sig=${sig}`,
    );
  });

  it("strips a trailing slash on the origin", () => {
    const id = "c".repeat(32);
    const sig = "d".repeat(64);
    expect(ticketPassUrl("http://localhost:5173/", id, sig)).toBe(
      `http://localhost:5173/pass/${id}?sig=${sig}`,
    );
  });
});
