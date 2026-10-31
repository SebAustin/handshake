import { describe, expect, test } from "vitest";
import { createDeal, type Deal } from "./state-machine";
import { dealToRow, rowToDeal } from "./row";

const FULL_DEAL: Deal = {
  id: "deal-1",
  state: "payout_pending",
  brief: "Landing page copy",
  criteria: [{ id: "headline", text: "Short headline" }],
  mandates: {
    client: { role: "client", budgetCeilingCents: 12000, maxDeadlineHours: 48, minWeights: {} },
    freelancer: { role: "freelancer", minPriceCents: 8000, minDeadlineHours: 24, maxWeights: {} },
  },
  terms: { priceCents: 10000, deadlineHours: 36, weights: { headline: 10000 } },
  hold: { orderId: "ORDER-1", authorizationId: "AUTH-1" },
  deliveryAttempt: 1,
  verdict: { attempt: 1, results: [{ criterionId: "headline", passed: true, reason: "ok", evidence: "" }] },
  plan: { kind: "full", captureCents: 10000, feeCents: 500, payoutCents: 9500, passedBp: 10000 },
  capture: { captureId: "CAP-1", amountCents: 10000 },
  payout: { batchId: "BATCH-1" },
};

describe("row mapping", () => {
  test("round-trips a fully populated Deal", () => {
    expect(rowToDeal(dealToRow(FULL_DEAL))).toEqual(FULL_DEAL);
  });

  test("stores absent parts as null and reads them back as absent", () => {
    const fresh = createDeal({ id: "deal-2", brief: "Blog post" });

    const row = dealToRow(fresh);

    expect(row.terms).toBeNull();
    expect(row.hold).toBeNull();
    expect(rowToDeal(row)).toEqual(fresh);
    expect("terms" in rowToDeal(row)).toBe(false);
  });
});
