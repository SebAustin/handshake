"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { closeContestWindowAction, contestAction, waiveContestAction, type WorkState } from "@/app/deals/work-actions";
import type { Criterion, Role, SettlementPlan, Terms, Verdict } from "@/deals/model";
import type { DealState } from "@/deals/state-machine";
import { criterionLabel, formatCents, formatPercent } from "@/lib/format";
import { CONTEST_WINDOW_MS } from "@/settlement/contest-window";

interface VerdictPanelProps {
  dealId: string;
  persona: Role;
  state: DealState;
  criteria: readonly Criterion[];
  verdict: Verdict;
  plan: SettlementPlan;
  terms: Terms;
  closesAt?: string;
  waivers: readonly Role[];
  contest?: { by: Role; reason: string };
}

/** The Arbiter's Verdict, what it means in money, and the Contest Window before any money moves. */
export function VerdictPanel(props: VerdictPanelProps) {
  const { verdict, criteria, plan, terms, state } = props;
  const passed = verdict.results.filter((r) => r.passed).length;
  const isWindowOpen = state === "judged";

  return (
    <section aria-labelledby="verdict-heading" className="rounded-card bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="verdict-heading" className="text-base font-medium">
          Verdict{verdict.attempt === 2 ? " on the revision" : ""}
        </h2>
        <p className="text-sm text-muted">By the neutral Arbiter · Claude Opus</p>
      </div>

      <p className="mt-3 font-serif text-2xl">
        {passed} of {verdict.results.length} criteria passed · {formatPercent(plan.passedBp)} of the price earned
      </p>
      <PlanLine plan={plan} terms={terms} hasSettled={MONEY_MOVED.has(state)} />

      <ul className="mt-5 flex flex-col">
        {verdict.results.map((result) => {
          const criterion = criteria.find((c) => c.id === result.criterionId);
          const share = Math.floor((terms.priceCents * (terms.weights[result.criterionId] ?? 0)) / 10_000);
          return (
            <li key={result.criterionId} className="grid gap-1 border-t border-rule py-3 sm:grid-cols-[88px_1fr_auto] sm:gap-4">
              <span className={`text-sm font-medium ${result.passed ? "text-positive" : "text-negative"}`}>
                {result.passed ? "Passed" : "Failed"}
              </span>
              <div className="flex flex-col gap-1">
                <span className="font-medium">{criterionLabel(result.criterionId)}</span>
                {criterion && <span className="text-sm text-muted">{criterion.text}</span>}
                <span>{result.reason}</span>
                {result.evidence && (
                  <blockquote className="border-l-2 border-control pl-3 text-sm text-muted">“{result.evidence}”</blockquote>
                )}
              </div>
              <span className={`figures text-sm ${result.passed ? "text-ink" : "text-muted line-through"}`}>
                {formatCents(share)}
              </span>
            </li>
          );
        })}
      </ul>

      {isWindowOpen && <ContestWindow {...props} />}
      {state === "contested" && props.contest && (
        <p className="mt-4 rounded-card bg-ground p-4">
          {props.contest.by === "client" ? "Maya" : "Dev"} contested this Verdict: “{props.contest.reason}”. Settlement is
          frozen and the Deal goes to a human. No money has moved.
        </p>
      )}
    </section>
  );
}

/** States in which Settlement has already reached PayPal, so the plan reads in the past tense. */
const MONEY_MOVED = new Set<DealState>(["payout_pending", "paid", "payout_failed", "voided"]);

function PlanLine({ plan, terms, hasSettled }: { plan: SettlementPlan; terms: Terms; hasSettled: boolean }) {
  if (plan.kind === "revision") return <p className="mt-1 text-muted">Nothing earned yet. Dev gets one revision.</p>;
  if (plan.kind === "void") {
    return (
      <p className="mt-1 text-muted">
        Nothing earned. {hasSettled ? "The Hold was voided and Maya paid nothing." : "The Hold will be voided and Maya pays nothing."}
      </p>
    );
  }
  const released = terms.priceCents - plan.captureCents;
  return (
    <p className="figures mt-1">
      {hasSettled ? "PayPal captured" : "PayPal will capture"} {formatCents(plan.captureCents)} of the{" "}
      {formatCents(terms.priceCents)} held. Dev {hasSettled ? "receives" : "will receive"} {formatCents(plan.payoutCents)}{" "}
      after the {formatCents(plan.feeCents)} platform fee
      {plan.kind === "partial" ? `, and ${formatCents(released)} ${hasSettled ? "went" : "goes"} back to Maya` : ""}.
    </p>
  );
}

function ContestWindow({ dealId, persona, closesAt, waivers }: VerdictPanelProps) {
  // Read the clock only in the browser, so server and client render the same first frame.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [isClosing, startClosing] = useTransition();
  const [isContesting, setIsContesting] = useState(false);
  const [contestState, contest, isSending] = useActionState<WorkState, FormData>(contestAction.bind(null, dealId), {});
  const closeRequested = useRef(false);
  const [settleError, setSettleError] = useState<string>();
  const hasWaived = waivers.includes(persona);
  const other = persona === "client" ? "Dev" : "Maya";

  useEffect(() => {
    const id = setInterval(() => {
      const left = closesAt ? Math.max(0, Date.parse(closesAt) - Date.now()) : 0;
      setRemainingMs(left);
      if (left === 0 && !closeRequested.current) {
        closeRequested.current = true;
        startClosing(async () => setSettleError((await closeContestWindowAction(dealId)).error));
      }
    }, 250);
    return () => clearInterval(id);
  }, [closesAt, dealId]);

  const seconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const progress = remainingMs === null ? 0 : 1 - remainingMs / CONTEST_WINDOW_MS;

  return (
    <div className="mt-5 flex flex-col gap-4 rounded-card bg-ground p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-medium">
          {isClosing || seconds === 0
            ? "Settling with PayPal…"
            : seconds === null
              ? "Money moves shortly unless someone contests."
              : `Money moves in ${seconds} s unless someone contests.`}
        </p>
        <span className="h-1.5 w-40 overflow-hidden rounded-full bg-raised" aria-hidden="true">
          <span
            className="block h-full origin-left rounded-full bg-accent"
            style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
          />
        </span>
      </div>

      {!isContesting ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={hasWaived || isClosing}
            onClick={() => startClosing(async () => setSettleError((await waiveContestAction(dealId)).error))}
            className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {hasWaived ? `Waiting for ${other} to agree` : "Settle now"}
          </button>
          <button
            type="button"
            onClick={() => setIsContesting(true)}
            disabled={isClosing}
            className="press h-10 rounded-control bg-raised px-4 text-sm disabled:opacity-60"
          >
            Contest the Verdict
          </button>
          <p className="text-sm text-muted">Settling early needs both Maya and Dev.</p>
          {settleError && <p role="alert" className="w-full text-sm text-negative">{settleError}</p>}
        </div>
      ) : (
        <form action={contest} className="flex flex-col gap-3">
          <label htmlFor="reason" className="text-sm font-medium">
            Why is the Verdict wrong?
          </label>
          <textarea id="reason" name="reason" rows={2} required minLength={5} maxLength={500} className="rounded-control border border-border bg-surface p-3" />
          <div className="flex gap-3">
            <button type="submit" disabled={isSending} className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white disabled:opacity-60">
              {isSending ? "Contesting…" : "Contest and freeze Settlement"}
            </button>
            <button type="button" onClick={() => setIsContesting(false)} className="press h-10 rounded-control bg-raised px-4 text-sm">
              Cancel
            </button>
          </div>
          {contestState.error && <p role="alert" className="text-sm text-negative">{contestState.error}</p>}
        </form>
      )}
    </div>
  );
}
