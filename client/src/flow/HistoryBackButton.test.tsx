import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryBackButton } from "./HistoryBackButton";

afterEach(() => {
  cleanup();
});

describe("HistoryBackButton", () => {
  it("returns to the previous history entry", () => {
    render(
      <MemoryRouter initialEntries={["/guest", "/login"]} initialIndex={1}>
        <Routes>
          <Route path="/guest" element={<p>Home screen</p>} />
          <Route path="/login" element={<HistoryBackButton />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Home screen")).toBeTruthy();
  });

  it("falls back to the guest portal home when this is the first history entry", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/guest" element={<p>Home screen</p>} />
          <Route path="/login" element={<HistoryBackButton />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Home screen")).toBeTruthy();
  });

  it("prefers an explicit handler when the flow owns the previous step", () => {
    let called = false;
    render(
      <MemoryRouter initialEntries={["/guest", "/guest/tickets"]} initialIndex={1}>
        <Routes>
          <Route path="/guest" element={<p>Home screen</p>} />
          <Route
            path="/guest/tickets"
            element={
              <HistoryBackButton
                onClick={() => {
                  called = true;
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(called).toBe(true);
    expect(screen.queryByText("Home screen")).toBeNull();
  });
});
