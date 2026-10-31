import { describe, expect, test } from "vitest";
import type { ClientMandate, Criterion, FreelancerMandate, Terms, Verdict } from "./model";
import { createDeal, transition, type Deal, type DealEvent } from "./state-machine";

const CRITERIA: Criterion[] = [
  { id: "headline", text: "Headline under 10 words" },
  { id: "tone", text: "Friendly, confident tone" },
  { id: "cta", text: "Ends with a clear call to action" },
];

const CLIENT: ClientMandate = { role: "client", budgetCeilingCents: 12000, maxDeadlineHours: 48, minWeights: {} };
const FREELANCER: FreelancerMandate = { role: "freelancer", minPriceCents: 8000, minDeadlineHours: 24, maxWeights: {} };
const TERMS: Terms = { priceCents: 10000, deadlineHours: 36, weights: { headline: 5000, tone: 2000, cta: 3000 } };

function verdict(attempt: 1 | 2, passed: [boolean, boolean, boolean]): Verdict {
  return {
    attempt,
    results: CRITERIA.map((c, i) => ({ criterionId: c.id, passed: passed[i], reason: "r", evidence: "" })),
  };
}

/** Applies events in order and fails the test on the first rejected transition. */
function run(events: DealEvent[], start: Deal = createDeal({ id: "deal-1", brief: "Landing page copy" })): Deal {
  return events.reduce((deal, event) => {
    const result = transition(deal, event);
    if (!result.ok) throw new Error(`${event.type} rejected: ${result.error.message}`);
    return result.deal;
  }, start);
}

const TO_HELD: DealEvent[] = [
  { type: "CRITERIA_APPROVED", criteria: CRITERIA },
  { type: "NEGOTIATION_STARTED", client: CLIENT, freelancer: FREELANCER },
  { type: "AGREEMENT_REACHED", terms: TERMS },
  { type: "HOLD_REQUESTED", orderId: "ORDER-1" },
  { type: "HOLD_PLACED", authorizationId: "AUTH-1", amountCents: 10000 },
];

describe("happy path", () => {
  test("a fully passing Delivery ends paid", () => {
    const deal = run([
      ...TO_HELD,
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(1, [true, true, true]) },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "CAPTURED", captureId: "CAP-1", amountCents: 10000 },
      { type: "PAYOUT_SENT", batchId: "BATCH-1" },
      { type: "PAYOUT_SUCCEEDED" },
    ]);

    expect(deal.state).toBe("paid");
    expect(deal.plan).toMatchObject({ kind: "full", payoutCents: 9500 });
    expect(deal.payout).toEqual({ batchId: "BATCH-1" });
  });

  test("a partial Verdict captures the weighted share", () => {
    const deal = run([
      ...TO_HELD,
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(1, [true, true, false]) },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "CAPTURED", captureId: "CAP-1", amountCents: 7000 },
    ]);

    expect(deal.state).toBe("payout_pending");
    expect(deal.capture).toEqual({ captureId: "CAP-1", amountCents: 7000 });
  });
});

describe("revision and void", () => {
  test("a first total fail asks for one revision, a second voids the Hold", () => {
    const deal = run([
      ...TO_HELD,
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(1, [false, false, false]) },
      { type: "CONTEST_WINDOW_CLOSED" },
    ]);
    expect(deal.state).toBe("revision_requested");

    const voided = run(
      [
        { type: "DELIVERY_SUBMITTED" },
        { type: "VERDICT_ISSUED", verdict: verdict(2, [false, false, false]) },
        { type: "CONTEST_WINDOW_CLOSED" },
        { type: "HOLD_VOIDED" },
      ],
      deal,
    );
    expect(voided.state).toBe("voided");
    expect(voided.deliveryAttempt).toBe(2);
  });

  test("a third Delivery is impossible", () => {
    const voided = run([
      ...TO_HELD,
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(1, [false, false, false]) },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(2, [false, false, false]) },
      { type: "CONTEST_WINDOW_CLOSED" },
    ]);

    expect(transition(voided, { type: "DELIVERY_SUBMITTED" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
  });
});

describe("guards", () => {
  test("an agreement outside either Mandate is rejected", () => {
    const negotiating = run(TO_HELD.slice(0, 2));
    const result = transition(negotiating, { type: "AGREEMENT_REACHED", terms: { ...TERMS, priceCents: 13000 } });

    expect(result).toMatchObject({ ok: false, error: { code: "GUARD_FAILED" } });
    expect(result.ok ? null : result.error.message).toMatch(/budget/i);
  });

  test("negotiation cannot start between Mandates that can never agree", () => {
    const approved = run(TO_HELD.slice(0, 1));
    const result = transition(approved, {
      type: "NEGOTIATION_STARTED",
      client: { ...CLIENT, budgetCeilingCents: 5000 },
      freelancer: FREELANCER,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "GUARD_FAILED" } });
  });

  test("criteria must have unique ids", () => {
    const result = transition(createDeal({ id: "d", brief: "b" }), {
      type: "CRITERIA_APPROVED",
      criteria: [CRITERIA[0], CRITERIA[0]],
    });

    expect(result).toMatchObject({ ok: false, error: { code: "GUARD_FAILED" } });
  });

  test("the Hold must cover exactly the agreed price", () => {
    const pending = run(TO_HELD.slice(0, 4));

    expect(transition(pending, { type: "HOLD_PLACED", authorizationId: "AUTH-1", amountCents: 9999 })).toMatchObject({
      ok: false,
      error: { code: "GUARD_FAILED" },
    });
  });

  test("a Verdict for the wrong attempt is rejected", () => {
    const delivered = run([...TO_HELD, { type: "DELIVERY_SUBMITTED" }]);

    expect(transition(delivered, { type: "VERDICT_ISSUED", verdict: verdict(2, [true, true, true]) })).toMatchObject({
      ok: false,
      error: { code: "GUARD_FAILED" },
    });
  });

  test("a Verdict that skips a criterion is rejected", () => {
    const delivered = run([...TO_HELD, { type: "DELIVERY_SUBMITTED" }]);
    const incomplete: Verdict = { attempt: 1, results: verdict(1, [true, true, true]).results.slice(0, 2) };

    expect(transition(delivered, { type: "VERDICT_ISSUED", verdict: incomplete })).toMatchObject({
      ok: false,
      error: { code: "GUARD_FAILED" },
    });
  });

  test("the captured amount must match the Settlement plan", () => {
    const settling = run([
      ...TO_HELD,
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(1, [true, true, false]) },
      { type: "CONTEST_WINDOW_CLOSED" },
    ]);

    expect(transition(settling, { type: "CAPTURED", captureId: "CAP-1", amountCents: 10000 })).toMatchObject({
      ok: false,
      error: { code: "GUARD_FAILED" },
    });
    expect(transition(settling, { type: "HOLD_VOIDED" })).toMatchObject({ ok: false });
  });
});

describe("contest and failures", () => {
  test("a Contest freezes Settlement", () => {
    const contested = run([
      ...TO_HELD,
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(1, [true, false, false]) },
      { type: "CONTEST_FILED", by: "freelancer", reason: "Tone is fine" },
    ]);

    expect(contested.state).toBe("contested");
    expect(contested.contest).toEqual({ by: "freelancer", reason: "Tone is fine" });
    expect(transition(contested, { type: "CONTEST_WINDOW_CLOSED" })).toMatchObject({ ok: false });
  });

  test("a failed payout is recorded with PayPal's reason", () => {
    const failed = run([
      ...TO_HELD,
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict(1, [true, true, true]) },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "CAPTURED", captureId: "CAP-1", amountCents: 10000 },
      { type: "PAYOUT_SENT", batchId: "BATCH-1" },
      { type: "PAYOUT_FAILED", reason: "Payment to self is not allowed." },
    ]);

    expect(failed.state).toBe("payout_failed");
    expect(failed.payout).toEqual({ batchId: "BATCH-1", failureReason: "Payment to self is not allowed." });
  });

  test("negotiation can end without a Deal", () => {
    expect(run([...TO_HELD.slice(0, 2), { type: "NEGOTIATION_FAILED" }]).state).toBe("no_deal");
  });
});

describe("immutability", () => {
  test("transitions never modify the input Deal", () => {
    const before = run(TO_HELD.slice(0, 2));
    const snapshot = structuredClone(before);

    transition(before, { type: "AGREEMENT_REACHED", terms: TERMS });

    expect(before).toEqual(snapshot);
  });

  test("events from the wrong state are rejected without throwing", () => {
    const fresh = createDeal({ id: "d", brief: "b" });

    expect(transition(fresh, { type: "PAYOUT_SUCCEEDED" })).toEqual({
      ok: false,
      error: { code: "INVALID_TRANSITION", message: "PAYOUT_SUCCEEDED is not allowed in state brief_drafted" },
    });
  });
});
