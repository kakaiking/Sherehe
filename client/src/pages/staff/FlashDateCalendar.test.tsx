import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlashDateCalendar } from "./FlashDateCalendar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-22T12:00:00+03:00"));
});

describe("FlashDateCalendar", () => {
  it("disables yesterday and days after the event night", () => {
    render(<FlashDateCalendar selectedDates={[]} onChange={() => undefined} />);

    expect(
      screen.getByRole("gridcell", { name: /2026-09-21/ }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("gridcell", { name: /2026-09-22/ }),
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("gridcell", { name: /2026-09-25/ }),
    ).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    // November 2026
    expect(
      screen.getByRole("gridcell", { name: /2026-11-28/ }),
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("gridcell", { name: /2026-11-29/ }),
    ).toHaveProperty("disabled", true);
  });

  it("does not select a disabled day", () => {
    const onChange = vi.fn();
    render(<FlashDateCalendar selectedDates={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("gridcell", { name: /2026-09-21/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows deselecting a previously saved past day", () => {
    const onChange = vi.fn();
    render(
      <FlashDateCalendar selectedDates={["2026-09-21"]} onChange={onChange} />,
    );

    fireEvent.click(
      screen.getByRole("gridcell", { name: /2026-09-21.*selected/ }),
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
