import { describe, expect, it } from "vitest";
import {
  sanitizeDisplayName,
  sanitizeGivenName,
  stubHolderCaption,
} from "./holder.js";

describe("stub holder caption", () => {
  it("strips control characters and trims the Google display name", () => {
    expect(sanitizeDisplayName("  Walter\nKamau  ")).toBe("Walter Kamau");
    expect(sanitizeDisplayName("   ")).toBeNull();
  });

  it("prefers Google given_name, else the first word of the display name", () => {
    expect(sanitizeGivenName("Walter", "Walter Kamau")).toBe("Walter");
    expect(sanitizeGivenName(null, "Amina Njeri")).toBe("Amina");
  });

  it("writes the buyer name on a solo pass and first-name possessive on group", () => {
    expect(
      stubHolderCaption({
        ticketCode: "early_bird",
        displayName: "Walter Kamau",
        givenName: "Walter",
        email: "walter@example.com",
      }),
    ).toBe("Walter Kamau");
    expect(
      stubHolderCaption({
        ticketCode: "group",
        displayName: "Walter Kamau",
        givenName: "Walter",
        email: "walter@example.com",
      }),
    ).toBe("Walter's group");
  });

  it("falls back to the email local part when Google sent no name", () => {
    expect(
      stubHolderCaption({
        ticketCode: "regular",
        displayName: null,
        givenName: null,
        email: "kakaiteclimited@gmail.com",
      }),
    ).toBe("kakaiteclimited");
  });
});
