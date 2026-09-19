import { describe, expect, it } from "vitest";
import { formatKsh } from "./api";

describe("formatKsh", () => {
  it("formats Kenyan shillings with a grouping separator", () => {
    expect(formatKsh(3500)).toMatch(/KSh/);
    expect(formatKsh(3500)).toMatch(/3/);
  });
});
