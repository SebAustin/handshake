import { describe, expect, test } from "vitest";
import type { Verdict } from "@/deals/model";
import { feeFor, planSettlement } from "./plan";

const WEIGHTS = { headline: 4000, tone: 3000, length: 2000, cta: 1000 };

function verdict(attempt: 1 | 2, passed: Record<keyof typeof WEIGHTS, boolean>): Verdict {
  return {
    attempt,
    results: Object.entries(passed).map(([criterionId, ok]) => ({
      criterionId,
      passed: ok,
      reason: ok ? "meets the criterion" : "misses the criterion",
      evidence: "",
    })),
  };
}

const ALL_PASS = { headline: true, tone: true, length: true, cta: true };
const NONE_PASS = { headline: false, tone: false, length: false, cta: false };

describe("feeFor", () => {
  test("takes 5% rounded half-up to the cent", () => {
    expect(feeFor(7000)).toBe(350);
    expect(feeFor(10)).toBe(1); // 0.5 → 1
    expect(feeFor(9)).toBe(0); // 0.45 → 0
  });
});

describe("planSettlement", () => {
  test("captures the full price when every criterion passes", () => {
    expect(planSettlement({ priceCents: 10000, weights: WEIGHTS, verdict: verdict(1, ALL_PASS) })).toEqual({
      kind: "full",
      captureCents: 10000,
      feeCents: 500,
      payoutCents: 9500,
      passedBp: 10000,
    });
  });

  test("captures the weighted share of passed criteria when some fail", () => {
    const plan = planSettlement({
      priceCents: 10000,
      weights: WEIGHTS,
      verdict: verdict(1, { headline: true, tone: true, length: false, cta: false }),
    });

    expect(plan).toEqual({ kind: "partial", captureCents: 7000, feeCents: 350, payoutCents: 6650, passedBp: 7000 });
  });

  test("rounds a partial capture down so the Client is never over-charged", () => {
    const plan = planSettlement({
      priceCents: 999,
      weights: WEIGHTS,
      verdict: verdict(1, { headline: false, tone: true, length: false, cta: false }),
    });

    expect(plan).toMatchObject({ kind: "partial", captureCents: 299 }); // 299.7 → 299
  });

  test("offers one revision when the first Delivery fails every criterion", () => {
    expect(planSettlement({ priceCents: 10000, weights: WEIGHTS, verdict: verdict(1, NONE_PASS) })).toEqual({
      kind: "revision",
      passedBp: 0,
    });
  });

  test("voids the Hold when the revised Delivery also fails every criterion", () => {
    expect(planSettlement({ priceCents: 10000, weights: WEIGHTS, verdict: verdict(2, NONE_PASS) })).toEqual({
      kind: "void",
      passedBp: 0,
    });
  });

  test("voids when the passed share rounds to zero cents", () => {
    const plan = planSettlement({
      priceCents: 1,
      weights: WEIGHTS,
      verdict: verdict(2, { headline: false, tone: false, length: false, cta: true }),
    });

    expect(plan).toEqual({ kind: "void", passedBp: 1000 });
  });

  test("ignores a passed result for a criterion that carries no weight", () => {
    const plan = planSettlement({
      priceCents: 10000,
      weights: { ...WEIGHTS, bonus: 0 },
      verdict: {
        attempt: 1,
        results: [
          ...verdict(1, { headline: true, tone: false, length: false, cta: false }).results,
          { criterionId: "bonus", passed: true, reason: "ok", evidence: "" },
        ],
      },
    });

    expect(plan).toMatchObject({ kind: "partial", passedBp: 4000, captureCents: 4000 });
  });

  test("rejects a Verdict that does not cover every weighted criterion exactly once", () => {
    const missing: Verdict = { attempt: 1, results: verdict(1, ALL_PASS).results.slice(1) };
    const duplicated: Verdict = { attempt: 1, results: [...verdict(1, ALL_PASS).results, verdict(1, ALL_PASS).results[0]] };
    const unknown: Verdict = {
      attempt: 1,
      results: [...verdict(1, ALL_PASS).results, { criterionId: "ghost", passed: true, reason: "x", evidence: "" }],
    };

    expect(() => planSettlement({ priceCents: 10000, weights: WEIGHTS, verdict: missing })).toThrow(/headline/);
    expect(() => planSettlement({ priceCents: 10000, weights: WEIGHTS, verdict: duplicated })).toThrow(/more than once/);
    expect(() => planSettlement({ priceCents: 10000, weights: WEIGHTS, verdict: unknown })).toThrow(/ghost/);
  });

  test("rejects weights that do not sum to 10 000 bp", () => {
    expect(() =>
      planSettlement({ priceCents: 10000, weights: { headline: 5000 }, verdict: verdict(1, ALL_PASS) }),
    ).toThrow(/10000/);
  });
});
