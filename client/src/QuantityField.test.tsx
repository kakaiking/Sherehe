import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { QuantityField } from "./QuantityField";

function Harness({
  start = 1,
  min = 1,
  max = 20,
}: {
  start?: number;
  min?: number;
  max?: number;
}): ReactElement {
  const [qty, setQty] = useState(start);
  return <QuantityField value={qty} min={min} max={max} onChange={setQty} />;
}

afterEach(() => {
  cleanup();
});

describe("QuantityField", () => {
  it("steps with large minus and plus controls, not a native spinner", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Quantity") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(screen.queryByRole("spinbutton")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(input.value).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Remove one" }));
    expect(input.value).toBe("1");
  });

  it("disables remove at the floor and add at the ceiling", () => {
    render(<Harness start={1} min={1} max={3} />);
    expect(
      (screen.getByRole("button", { name: "Remove one" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe(
      "3",
    );
    expect(
      (screen.getByRole("button", { name: "Add one" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("clamps typed values and ignores junk", () => {
    render(<Harness max={20} />);
    const input = screen.getByLabelText("Quantity") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "99" } });
    expect(input.value).toBe("20");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.value).toBe("20");
  });

  it("does not submit the surrounding form when stepping", () => {
    const submitted: string[] = [];
    function FormHarness(): ReactElement {
      const [qty, setQty] = useState(1);
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitted.push("yes");
          }}
        >
          <QuantityField value={qty} onChange={setQty} />
        </form>
      );
    }
    render(<FormHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(submitted).toEqual([]);
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe(
      "2",
    );
  });
});
