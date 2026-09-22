import { describe, expect, it } from "vitest";
import { splitOfferingName } from "./offeringName";

describe("splitOfferingName", () => {
  it("puts a trailing parenthetical on its own line", () => {
    expect(splitOfferingName("Group Ticket (5 people)")).toEqual({
      title: "Group Ticket",
      note: "(5 people)",
    });
  });

  it("leaves plain names alone", () => {
    expect(splitOfferingName("Regular Ticket")).toEqual({
      title: "Regular Ticket",
      note: null,
    });
  });
});
