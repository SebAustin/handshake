import { describe, expect, test } from "vitest";
import { niceRange } from "@/components/deal/ConvergenceChart";
import { criterionLabel, dealTitle, formatCents, formatPercent } from "./format";

describe("format", () => {
  test("formats cents as US dollars", () => {
    expect(formatCents(10400)).toBe("$104.00");
    expect(formatCents(5)).toBe("$0.05");
  });

  test("formats basis points as a short percentage", () => {
    expect(formatPercent(2400)).toBe("24%");
    expect(formatPercent(3333)).toBe("33.3%");
  });

  test("titles a Deal from the Brief's first sentence", () => {
    expect(dealTitle("I need landing page copy for Brewlab, a coffee subscription. Friendly tone.")).toBe(
      "Landing page copy for Brewlab",
    );
    expect(dealTitle("I need a tagline. Short.")).toBe("A tagline");
    expect(dealTitle("[Test, no money] I need landing page copy for Brewlab, a coffee subscription.")).toBe(
      "[Test, no money] Landing page copy for Brewlab",
    );
    expect(dealTitle("x".repeat(100)).length).toBe(48);
  });

  test("turns criterion ids into readable labels", () => {
    expect(criterionLabel("free-trial-cta")).toBe("Free trial cta");
    expect(criterionLabel("tone-2")).toBe("Tone");
  });
});

describe("niceRange", () => {
  test("picks round dollar steps that cover the values", () => {
    expect(niceRange(7000, 13500)).toEqual({ lo: 6000, hi: 14000, step: 2000 });
    expect(niceRange(9000, 10400)).toEqual({ lo: 9000, hi: 10500, step: 500 });
  });
});
