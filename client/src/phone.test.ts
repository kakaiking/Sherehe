import { describe, expect, it } from "vitest";
import {
  caretIndexForDigitCount,
  extractKenyanNationalDigits,
  formatKenyanMsisdnDisplay,
  formatKenyanNational,
  isCompleteKenyanNational,
  kenyanPhonePayload,
} from "./phone";

describe("extractKenyanNationalDigits", () => {
  it("keeps at most 9 national digits", () => {
    expect(extractKenyanNationalDigits("712345678999")).toBe("712345678");
  });

  it("strips 0, 254, and +254 prefixes", () => {
    expect(extractKenyanNationalDigits("0712345678")).toBe("712345678");
    expect(extractKenyanNationalDigits("+254712345678")).toBe("712345678");
    expect(extractKenyanNationalDigits("254 712 345 678")).toBe("712345678");
  });
});

describe("formatKenyanNational", () => {
  it("groups remaining digits with spaces", () => {
    expect(formatKenyanNational("7")).toBe("7");
    expect(formatKenyanNational("712")).toBe("712");
    expect(formatKenyanNational("7123")).toBe("712 3");
    expect(formatKenyanNational("712345678")).toBe("712 345 678");
  });
});

describe("formatKenyanMsisdnDisplay", () => {
  it("shows +254 then spaced national digits", () => {
    expect(formatKenyanMsisdnDisplay("254700000000")).toBe("+254 700 000 000");
  });
});

describe("kenyanPhonePayload", () => {
  it("sends +254 plus national digits", () => {
    expect(kenyanPhonePayload("712 345 678")).toBe("+254712345678");
  });
});

describe("isCompleteKenyanNational", () => {
  it("requires 9 digits starting 1 or 7", () => {
    expect(isCompleteKenyanNational("712345678")).toBe(true);
    expect(isCompleteKenyanNational("112345678")).toBe(true);
    expect(isCompleteKenyanNational("71234567")).toBe(false);
    expect(isCompleteKenyanNational("212345678")).toBe(false);
  });
});

describe("caretIndexForDigitCount", () => {
  it("lands after the matching digit, skipping spaces", () => {
    expect(caretIndexForDigitCount("712 345 678", 3)).toBe(3);
    expect(caretIndexForDigitCount("712 345 678", 4)).toBe(5);
  });
});
