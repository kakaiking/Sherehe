import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider, useSnackbar } from "./snackbar";

function Probe(): ReactElement {
  const { show } = useSnackbar();
  return (
    <button type="button" onClick={() => show("Ticket order started.")}>
      Fire
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SnackbarProvider", () => {
  it("shows a status chip then dismisses it", () => {
    vi.useFakeTimers();
    render(
      <SnackbarProvider>
        <Probe />
      </SnackbarProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Fire" }).click();
    });
    const note = screen.getByRole("status");
    expect(note.textContent).toBe("Ticket order started.");
    expect(note.className).toContain("snackbar-ok");
    expect(note.parentElement?.className).toBe("snackbar-host");
    act(() => {
      vi.advanceTimersByTime(3800);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
