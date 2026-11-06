import type { Deal } from "@/deals/state-machine";
import { dealTitle } from "@/lib/format";

/**
 * Read model for the Ledger: turns the append-only ledger events that touched
 * PayPal into money lines. Amounts PayPal didn't echo back (voids, payouts,
 * fees) come from the Deal's own Terms and settlement plan, the same numbers
 * code used when it called PayPal.
 */

export interface LedgerEventRow {
  id: number;
  dealId: string;
  type: string;
  payload: Record<string, unknown>;
  paypalRef: string | null;
  createdAt: Date;
}

export type LedgerKind =
  | "hold"
  | "capture"
  | "release"
  | "fee"
  | "payout"
  | "payout_confirmed"
  | "payout_failed"
  | "receipt";

export interface LedgerEntry {
  key: string;
  at: Date;
  dealId: string;
  dealTitle: string;
  kind: LedgerKind;
  amountCents?: number;
  paypalRef?: string;
  note?: string;
}

export interface LedgerTotals {
  heldCents: number;
  capturedCents: number;
  releasedCents: number;
  feeCents: number;
  paidOutCents: number;
}

/** The ledger event types that correspond to a PayPal call. */
export const MONEY_EVENT_TYPES = [
  "HOLD_PLACED",
  "CAPTURED",
  "HOLD_VOIDED",
  "PAYOUT_SENT",
  "PAYOUT_SUCCEEDED",
  "PAYOUT_FAILED",
  "RECEIPT_ISSUED",
] as const;

type Line = Omit<LedgerEntry, "key" | "at" | "dealId" | "dealTitle">;

export function toLedgerEntries(rows: readonly LedgerEventRow[], dealsById: ReadonlyMap<string, Deal>): LedgerEntry[] {
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
    .flatMap((row) => {
      const deal = dealsById.get(row.dealId);
      // Seeded test events never reached PayPal, so they are not money.
      if (!deal || row.payload.seeded === true) return [];
      const ref = row.paypalRef ?? undefined;
      // Within one event, lines are listed in reverse of the order money moved, to read newest-first.
      return linesFor(row, deal, ref)
        .reverse()
        .map((line, index) => ({
          ...line,
          key: `${row.id}-${index}`,
          at: row.createdAt,
          dealId: deal.id,
          dealTitle: dealTitle(deal.brief),
        }));
    });
}

function linesFor(row: LedgerEventRow, deal: Deal, paypalRef: string | undefined): Line[] {
  const plan = deal.plan;
  const paid = plan?.kind === "full" || plan?.kind === "partial" ? plan : undefined;
  const ref = paypalRef === undefined ? {} : { paypalRef };

  switch (row.type) {
    case "HOLD_PLACED":
      return [{ kind: "hold", amountCents: numberIn(row.payload, "amountCents") ?? deal.terms?.priceCents, ...ref }];
    case "CAPTURED": {
      const captured = numberIn(row.payload, "amountCents") ?? deal.capture?.amountCents ?? 0;
      const released = (deal.terms?.priceCents ?? captured) - captured;
      return [
        { kind: "capture", amountCents: captured, ...ref },
        ...(released > 0 ? [{ kind: "release" as const, amountCents: released, ...ref }] : []),
      ];
    }
    case "HOLD_VOIDED":
      return [{ kind: "release", amountCents: deal.terms?.priceCents, ...ref }];
    case "PAYOUT_SENT":
      return paid
        ? [
            { kind: "payout", amountCents: paid.payoutCents, ...ref },
            { kind: "fee", amountCents: paid.feeCents, ...ref },
          ]
        : [];
    case "PAYOUT_SUCCEEDED":
      return [{ kind: "payout_confirmed", amountCents: paid?.payoutCents, ...ref }];
    case "PAYOUT_FAILED":
      return [{ kind: "payout_failed", note: stringIn(row.payload, "reason"), ...ref }];
    case "RECEIPT_ISSUED":
      return [{ kind: "receipt", ...ref }];
    default:
      return [];
  }
}

export function ledgerTotals(entries: readonly LedgerEntry[]): LedgerTotals {
  const sum = (kind: LedgerKind) =>
    entries.filter((e) => e.kind === kind).reduce((total, e) => total + (e.amountCents ?? 0), 0);
  return {
    heldCents: sum("hold"),
    capturedCents: sum("capture"),
    releasedCents: sum("release"),
    feeCents: sum("fee"),
    paidOutCents: sum("payout_confirmed"),
  };
}

function numberIn(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringIn(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export interface Reconciliation {
  /** Authorized but not yet captured or released: Deals still in progress. */
  stillHeldCents: number;
  /** Captured but not yet confirmed as paid out (payout pending or failed). */
  payoutInFlightCents: number;
  /** False when the totals can't be right: more left the Hold than entered it. */
  balances: boolean;
}

/** Checks the ledger against itself: held = captured + released + still held; captured = paid + fee + in flight. */
export function reconcile(totals: LedgerTotals): Reconciliation {
  const stillHeldCents = totals.heldCents - totals.capturedCents - totals.releasedCents;
  const payoutInFlightCents = totals.capturedCents - totals.paidOutCents - totals.feeCents;
  return { stillHeldCents, payoutInFlightCents, balances: stillHeldCents >= 0 && payoutInFlightCents >= 0 };
}
