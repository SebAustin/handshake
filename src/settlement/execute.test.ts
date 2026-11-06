import { describe, expect, test, vi } from "vitest";
import type { Verdict } from "@/deals/model";
import { createDeal, transition, type Deal, type DealEvent } from "@/deals/state-machine";
import { PayPalApiError, type PayoutBatch } from "@/paypal/client";
import { createMemoryDeals } from "@/test/memory-deals";
import { executeSettlement, refreshPayout } from "./execute";

const CRITERIA = [
  { id: "headline", text: "Short headline" },
  { id: "tone", text: "Friendly tone" },
];
const RECEIVER = "dev@personal.example.com";

function verdict(passed: [boolean, boolean], attempt: 1 | 2 = 1): Verdict {
  return {
    attempt,
    results: CRITERIA.map((c, i) => ({ criterionId: c.id, passed: passed[i], reason: "r", evidence: "" })),
  };
}

function dealIn(events: DealEvent[]): Deal {
  const start: DealEvent[] = [
    { type: "CRITERIA_APPROVED", criteria: CRITERIA },
    {
      type: "NEGOTIATION_STARTED",
      client: { role: "client", budgetCeilingCents: 20000, maxDeadlineHours: 48, minWeights: {} },
      freelancer: { role: "freelancer", minPriceCents: 5000, minDeadlineHours: 12, maxWeights: {} },
    },
    { type: "AGREEMENT_REACHED", terms: { priceCents: 10000, deadlineHours: 24, weights: { headline: 7000, tone: 3000 } } },
    { type: "HOLD_REQUESTED", orderId: "ORDER-1" },
    { type: "HOLD_PLACED", authorizationId: "AUTH-1", amountCents: 10000 },
    { type: "DELIVERY_SUBMITTED" },
  ];
  return [...start, ...events].reduce((deal, event) => {
    const result = transition(deal, event);
    if (!result.ok) throw new Error(result.error.message);
    return result.deal;
  }, createDeal({ id: "deal-1", brief: "Landing page copy" }));
}

const settlingWith = (passed: [boolean, boolean], attempt: 1 | 2 = 1) =>
  dealIn([{ type: "VERDICT_ISSUED", verdict: verdict(passed, attempt) }, { type: "CONTEST_WINDOW_CLOSED" }]);

function fakePayPal() {
  return {
    captureAuthorization: vi.fn(async (_id: string, input: { amountCents?: number }) => ({
      captureId: "CAP-1",
      status: "COMPLETED",
      amountCents: input.amountCents ?? 10000,
    })),
    voidAuthorization: vi.fn(async () => undefined),
    createPayout: vi.fn(async () => ({ batchId: "BATCH-1", status: "PENDING" })),
    getPayoutBatch: vi.fn(async (): Promise<PayoutBatch> => ({
      batchId: "BATCH-1",
      status: "SUCCESS",
      items: [{ itemId: "ITEM-1", status: "SUCCESS", error: undefined }],
    })),
  };
}

function setup(deal: Deal) {
  const deals = createMemoryDeals([deal]);
  const paypal = fakePayPal();
  return { deals, paypal, deps: { deals, paypal, payoutReceiverEmail: RECEIVER } };
}

describe("executeSettlement", () => {
  test("a full pass captures the whole Hold and pays out the price minus the fee", async () => {
    const { deps, paypal, deals } = setup(settlingWith([true, true]));

    const result = await executeSettlement(deps, "deal-1");

    expect(result).toMatchObject({ ok: true, deal: { state: "payout_pending", payout: { batchId: "BATCH-1" } } });
    expect(paypal.captureAuthorization).toHaveBeenCalledWith("AUTH-1", {
      finalCapture: true,
      requestId: "deal-1-capture",
    });
    expect(paypal.createPayout).toHaveBeenCalledWith({
      senderBatchId: "deal-1-payout",
      receiverEmail: RECEIVER,
      amountCents: 9500,
      note: expect.stringContaining("deal-1"),
    });
    expect(deals.ledger.map((e) => [e.type, e.context.paypalRef])).toEqual([
      ["CAPTURED", "CAP-1"],
      ["PAYOUT_SENT", "BATCH-1"],
    ]);
  });

  test("a partial pass captures only the passed share, releasing the rest", async () => {
    const { deps, paypal } = setup(settlingWith([true, false]));

    await executeSettlement(deps, "deal-1");

    expect(paypal.captureAuthorization).toHaveBeenCalledWith("AUTH-1", {
      amountCents: 7000,
      finalCapture: true,
      requestId: "deal-1-capture",
    });
    expect(paypal.createPayout).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 6650 }));
  });

  test("a void plan voids the Hold and pays nothing", async () => {
    const failedTwice = dealIn([
      { type: "VERDICT_ISSUED", verdict: verdict([false, false]) },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: verdict([false, false], 2) },
      { type: "CONTEST_WINDOW_CLOSED" },
    ]);
    const { deps, paypal } = setup(failedTwice);

    const result = await executeSettlement(deps, "deal-1");

    expect(result).toMatchObject({ ok: true, deal: { state: "voided" } });
    expect(paypal.voidAuthorization).toHaveBeenCalledWith("AUTH-1", "deal-1-void");
    expect(paypal.captureAuthorization).not.toHaveBeenCalled();
    expect(paypal.createPayout).not.toHaveBeenCalled();
  });

  test("resumes a Deal that was captured but whose payout was never sent", async () => {
    const capturedOnly = dealIn([
      { type: "VERDICT_ISSUED", verdict: verdict([true, true]) },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "CAPTURED", captureId: "CAP-1", amountCents: 10000 },
    ]);
    const { deps, paypal } = setup(capturedOnly);

    const result = await executeSettlement(deps, "deal-1");

    expect(result).toMatchObject({ ok: true, deal: { payout: { batchId: "BATCH-1" } } });
    expect(paypal.captureAuthorization).not.toHaveBeenCalled();
    expect(paypal.createPayout).toHaveBeenCalledTimes(1);
  });

  test("refuses to settle a Deal whose Contest Window is still open", async () => {
    const judged = dealIn([{ type: "VERDICT_ISSUED", verdict: verdict([true, true]) }]);
    const { deps, paypal } = setup(judged);

    expect(await executeSettlement(deps, "deal-1")).toMatchObject({ ok: false, error: { code: "NOT_SETTLEABLE" } });
    expect(paypal.captureAuthorization).not.toHaveBeenCalled();
  });

  test("reports a PayPal failure without changing the Deal", async () => {
    const { deps, paypal, deals } = setup(settlingWith([true, true]));
    paypal.captureAuthorization.mockRejectedValueOnce(
      new PayPalApiError("declined", 422, "UNPROCESSABLE_ENTITY", "dbg-1", ["AUTHORIZATION_EXPIRED"]),
    );

    const result = await executeSettlement(deps, "deal-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "PAYPAL_ERROR", message: expect.stringContaining("AUTHORIZATION_EXPIRED") },
    });
    expect((await deals.get("deal-1"))?.deal.state).toBe("settling");
  });
});

describe("refreshPayout", () => {
  const paidOut = () =>
    dealIn([
      { type: "VERDICT_ISSUED", verdict: verdict([true, true]) },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "CAPTURED", captureId: "CAP-1", amountCents: 10000 },
      { type: "PAYOUT_SENT", batchId: "BATCH-1" },
    ]);

  test("marks the Deal paid when PayPal reports the item succeeded", async () => {
    const { deps } = setup(paidOut());

    expect(await refreshPayout(deps, "deal-1")).toMatchObject({ ok: true, deal: { state: "paid" } });
  });

  test("records PayPal's reason when the payout fails", async () => {
    const { deps, paypal } = setup(paidOut());
    paypal.getPayoutBatch.mockResolvedValueOnce({
      batchId: "BATCH-1",
      status: "DENIED",
      items: [{ itemId: "ITEM-1", status: "FAILED", error: "Payment to self is not allowed." }],
    });

    expect(await refreshPayout(deps, "deal-1")).toMatchObject({
      ok: true,
      deal: { state: "payout_failed", payout: { failureReason: "Payment to self is not allowed." } },
    });
  });

  test("leaves the Deal pending while PayPal is still processing", async () => {
    const { deps, paypal } = setup(paidOut());
    paypal.getPayoutBatch.mockResolvedValueOnce({
      batchId: "BATCH-1",
      status: "PROCESSING",
      items: [{ itemId: "ITEM-1", status: "PENDING", error: undefined }],
    });

    expect(await refreshPayout(deps, "deal-1")).toMatchObject({ ok: true, deal: { state: "payout_pending" } });
  });
});
