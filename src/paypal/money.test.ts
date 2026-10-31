import { describe, expect, test } from "vitest";
import { centsToValue, valueToCents } from "./money";

describe("centsToValue", () => {
  test("formats whole and fractional amounts as PayPal decimal strings", () => {
    expect(centsToValue(1234)).toBe("12.34");
    expect(centsToValue(5)).toBe("0.05");
    expect(centsToValue(10000)).toBe("100.00");
  });

  test("rejects negative, zero and non-integer cents", () => {
    expect(() => centsToValue(-1)).toThrow();
    expect(() => centsToValue(0)).toThrow();
    expect(() => centsToValue(12.5)).toThrow();
  });
});

describe("valueToCents", () => {
  test("parses PayPal decimal strings into integer cents", () => {
    expect(valueToCents("70.00")).toBe(7000);
    expect(valueToCents("0.05")).toBe(5);
    expect(valueToCents("19.9")).toBe(1990);
    expect(valueToCents("3")).toBe(300);
  });

  test("rejects malformed amounts", () => {
    expect(() => valueToCents("abc")).toThrow();
    expect(() => valueToCents("1.234")).toThrow();
    expect(() => valueToCents("-1.00")).toThrow();
  });
});
