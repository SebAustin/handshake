"use client";

import { useEffect, useState, useTransition } from "react";
import { refreshPayoutAction, settleAction } from "@/app/deals/work-actions";
import type { SettlementPlan, Terms } from "@/deals/model";
import type { DealState } from "@/deals/state-machine";
import { formatCents } from "@/lib/format";

interface SettlementPanelProps {
  dealId: string;
  state: DealState;
  plan: SettlementPlan;
  terms: Terms;
  capture?: { captureId: string; amountCents: number };
  payout?: { batchId: string; failureReason?: string };
}

const PAYOUT_POLL_MS = 3000;

/** Where the money went, computed by code from the Verdict, with PayPal's live payout status. */
export function SettlementPanel({ dealId, state, plan, terms, capture, payout }: SettlementPanelProps) {
  const [isWorking, startWork] = useTransition();
  const [error, setError] = useState<string>();
  const isVoided = state === "voided";
  const returnedCents = terms.priceCents - (capture?.amountCents ?? 0);

  useEffect(() => {
    if (state !== "payout_pending" || !payout) return;
    const id = setInterval(() => void refreshPayoutAction(dealId), PAYOUT_POLL_MS);
    return () => clearInterval(id);
  }, [state, payout, dealId]);

  const stamp = isVoided ? "Voided" : state === "paid" ? "Settled" : state === "payout_failed" ? "Payout failed" : "Settling";
  const rows: [string, string, string?][] = isVoided
    ? [["Captured from Maya", formatCents(0)], ["Released back to Maya", formatCents(terms.priceCents)]]
    : [
        ["Captured from Maya", formatCents(capture?.amountCents ?? ("captureCents" in plan ? plan.captureCents : 0)), capture?.captureId],
        ["Released back to Maya", formatCents(returnedCents)],
        ["Platform fee (5%)", formatCents("feeCents" in plan ? plan.feeCents : 0)],
        ["Paid to Dev via PayPal Payouts", formatCents("payoutCents" in plan ? plan.payoutCents : 0), payout?.batchId],
      ];

  return (
    <section aria-labelledby="settlement-heading" className="relative overflow-hidden rounded-card bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="settlement-heading" className="text-base font-medium">
          Settlement
        </h2>
        <p className="text-sm text-muted">Computed by code from the Verdict · no model touched the money</p>
      </div>

      <p
        aria-live="polite"
        className={`stamp mt-5 inline-block rounded-control border-[3px] px-4 py-1 font-serif text-4xl tracking-wide uppercase ${
          state === "paid" || isVoided ? "border-stamp text-stamp" : state === "payout_failed" ? "border-negative text-negative" : "border-control text-muted"
        }`}
      >
        {stamp}
      </p>

      <dl className="mt-6 flex flex-col">
        {rows.map(([label, value, ref]) => (
          <div key={label} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-rule py-3">
            <dt>
              {label}
              {ref && <span className="figures ml-2 text-xs text-muted">{ref}</span>}
            </dt>
            <dd className="figures text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {state === "payout_pending" && <p className="mt-2 text-sm text-muted">PayPal is processing the payout. This page updates on its own.</p>}
      {state === "payout_failed" && (
        <p role="alert" className="mt-2 text-sm text-negative">
          PayPal declined the payout: {payout?.failureReason}. The capture stands; the payout needs attention.
        </p>
      )}
      {state === "settling" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isWorking}
            onClick={() =>
              startWork(async () => {
                const result = await settleAction(dealId);
                setError(result.error);
              })
            }
            className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {isWorking ? "Settling…" : "Retry Settlement"}
          </button>
          {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        </div>
      )}
    </section>
  );
}
