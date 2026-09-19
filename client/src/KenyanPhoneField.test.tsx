import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { KenyanPhoneField } from "./KenyanPhoneField";

function Harness(): ReactElement {
  const [phone, setPhone] = useState("");
  return <KenyanPhoneField value={phone} onChange={setPhone} />;
}

afterEach(() => {
  cleanup();
});

describe("KenyanPhoneField", () => {
  it("shows a +254 prefix and spaces the remaining digits", () => {
    render(<Harness />);
    expect(screen.getByText("+254")).toBeTruthy();
    const input = screen.getByLabelText("Kenyan mobile") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "712345678" } });
    expect(input.value).toBe("712 345 678");
  });

  it("drops extra digits past nine and unwraps a pasted +254", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Kenyan mobile") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "+254712345678999" } });
    expect(input.value).toBe("712 345 678");
  });
});
