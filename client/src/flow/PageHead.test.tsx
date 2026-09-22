import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageHead } from "./PageHead";

describe("PageHead", () => {
  it("places the title below the back button row, not beside it", () => {
    const { container } = render(
      <MemoryRouter>
        <PageHead title="Gate scan" byline="09:30" lede="Camera check-in" />
      </MemoryRouter>,
    );

    const lead = container.querySelector(".page-head-lead");
    expect(lead).toBeTruthy();
    expect(lead?.querySelector("h1")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();

    const title = screen.getByRole("heading", { name: "Gate scan" });
    expect(title.tagName).toBe("H1");
    expect(title.parentElement?.classList.contains("page-head")).toBe(true);
    expect(lead?.contains(title)).toBe(false);
  });
});
