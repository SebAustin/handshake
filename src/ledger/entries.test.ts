import { describe, expect, test } from "vitest";
import type { Deal } from "@/deals/state-machine";
import { ledgerTotals, reconcile, toLedgerEntries, type LedgerEventRow } from "./entries";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 9, 12, minute));

const partial: Deal = {
  id: "d-partial000",
  state: "paid",
  brief: "I need landing page copy for Brewlab. More detail.",
  criteria: [],
  deliveryAttempt: 1,
  terms: { priceCents: 10_400, deadlineHours: 24, weights: {} },
  plan: { kind: "partial", captureCents: 6_552, feeCents: 328, payoutCents: 6_224, passedBp: 6_300 },
  capture: { captureId: "CAP-1", amountCents: 6_552 },
};

const voided: Deal = {
  id: "d-voided0000",
  state: "voided",
  brief: "Write a tagline.",
  criteria: [],
  deliveryAttempt: 2,
  terms: { priceCents: 10_000, deadlineHours: 24, weights: {} },
  plan: { kind: "void", passedBp: 0 },
};

const row = (dealId: string, type: string, minute: number, extra: Partial<LedgerEventRow> = {}): LedgerEventRow => ({
  id: minute,
  dealId,
  type,
  payload: {},
  paypalRef: null,
  createdAt: at(minute),
  ...extra,
});

const deals = new Map([partial, voided].map((d) => [d.id, d]));

describe("toLedgerEntries", () => {
  test("turns a partial Deal's PayPal events into money lines, newest first", () => {
    const entries = toLedgerEntries(
      [
        row(partial.id, "HOLD_PLACED", 1, { payload: { amountCents: 10_400 }, paypalRef: "AUTH-1" }),
        row(partial.id, "CAPTURED", 2, { payload: { amountCents: 6_552 }, paypalRef: "CAP-1" }),
        row(partial.id, "PAYOUT_SENT", 3, { paypalRef: "BATCH-1" }),
        row(partial.id, "PAYOUT_SUCCEEDED", 4, { paypalRef: "ITEM-1" }),
        row(partial.id, "RECEIPT_ISSUED", 5, { paypalRef: "INV2-1" }),
      ],
      deals,
    );

    expect(entries.map((e) => [e.kind, e.amountCents ?? null, e.paypalRef ?? null])).toEqual([
      ["receipt", null, "INV2-1"],
      ["payout_confirmed", 6_224, "ITEM-1"],
      ["fee", 328, "BATCH-1"],
      ["payout", 6_224, "BATCH-1"],
      ["release", 3_848, "CAP-1"],
      ["capture", 6_552, "CAP-1"],
      ["hold", 10_400, "AUTH-1"],
    ]);
    expect(entries[0]).toMatchObject({ dealId: partial.id, dealTitle: "Landing page copy for Brewlab" });
  });

  test("a voided Hold releases the whole price", () => {
    const [entry] = toLedgerEntries([row(voided.id, "HOLD_VOIDED", 9, { paypalRef: "AUTH-2" })], deals);
    expect(entry).toMatchObject({ kind: "release", amountCents: 10_000, paypalRef: "AUTH-2" });
  });

  test("a full capture releases nothing", () => {
    const full: Deal = { ...partial, id: "d-full000000", capture: { captureId: "CAP-9", amountCents: 10_400 } };
    const entries = toLedgerEntries(
      [row(full.id, "CAPTURED", 2, { payload: { amountCents: 10_400 } })],
      new Map([[full.id, full]]),
    );
    expect(entries.map((e) => e.kind)).toEqual(["capture"]);
  });

  test("ignores non-money events and events for unknown Deals", () => {
    expect(
      toLedgerEntries([row(partial.id, "VERDICT_ISSUED", 1), row("d-missing000", "CAPTURED", 2)], deals),
    ).toEqual([]);
  });

  test("leaves out events written by the seed script: they never reached PayPal", () => {
    expect(
      toLedgerEntries([row(partial.id, "HOLD_PLACED", 1, { payload: { amountCents: 10_400, seeded: true } })], deals),
    ).toEqual([]);
  });

  test("a failed payout shows PayPal's reason and no amount", () => {
    const [entry] = toLedgerEntries([row(partial.id, "PAYOUT_FAILED", 4, { payload: { reason: "RECEIVER_UNREGISTERED" } })], deals);
    expect(entry).toMatchObject({ kind: "payout_failed", note: "RECEIVER_UNREGISTERED" });
    expect(entry?.amountCents).toBeUndefined();
  });
});

describe("ledgerTotals", () => {
  test("adds up each kind of money line", () => {
    const entries = toLedgerEntries(
      [
        row(partial.id, "HOLD_PLACED", 1, { payload: { amountCents: 10_400 } }),
        row(partial.id, "CAPTURED", 2, { payload: { amountCents: 6_552 } }),
        row(partial.id, "PAYOUT_SENT", 3),
        row(partial.id, "PAYOUT_SUCCEEDED", 4),
        row(voided.id, "HOLD_PLACED", 5, { payload: { amountCents: 10_000 } }),
        row(voided.id, "HOLD_VOIDED", 6),
      ],
      deals,
    );
    expect(ledgerTotals(entries)).toEqual({
      heldCents: 20_400,
      capturedCents: 6_552,
      releasedCents: 13_848,
      feeCents: 328,
      paidOutCents: 6_224,
    });
  });
});

describe("reconcile", () => {
  test("every held dollar is captured, released or still on hold; every captured dollar is paid, fee or in flight", () => {
    expect(
      reconcile({ heldCents: 30_400, capturedCents: 6_552, releasedCents: 13_848, feeCents: 328, paidOutCents: 6_000 }),
    ).toEqual({ stillHeldCents: 10_000, payoutInFlightCents: 224, balances: true });
  });

  test("flags totals that cannot be right", () => {
    expect(
      reconcile({ heldCents: 100, capturedCents: 80, releasedCents: 40, feeCents: 0, paidOutCents: 0 }).balances,
    ).toBe(false);
  });
});
