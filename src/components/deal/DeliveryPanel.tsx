"use client";

import { useActionState, useRef, useTransition } from "react";
import { judgeAgainAction, submitDeliveryAction, type WorkState } from "@/app/deals/work-actions";
import type { DealState } from "@/deals/state-machine";
import { SAMPLE_DELIVERIES, type SampleDeliveryKind } from "@/samples/demo";

interface DeliveryPanelProps {
  dealId: string;
  state: DealState;
  canDeliver: boolean;
  deadlineHours: number;
  attempt: 0 | 1 | 2;
  latest?: { attempt: 1 | 2; content: string };
}

const SAMPLES: { kind: SampleDeliveryKind; label: string }[] = [
  { kind: "strong", label: "Strong" },
  { kind: "partial", label: "Partial" },
  { kind: "weak", label: "Weak" },
  { kind: "injection", label: "Prompt injection" },
];

/** Dev submits the work; the neutral Arbiter judges it straight away. */
export function DeliveryPanel({ dealId, state, canDeliver, deadlineHours, attempt, latest }: DeliveryPanelProps) {
  const [submitState, submit, isSubmitting] = useActionState<WorkState, FormData>(
    submitDeliveryAction.bind(null, dealId),
    {},
  );
  const [isJudging, startJudging] = useTransition();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const isWaiting = state === "held" || state === "revision_requested";
  const isRevision = state === "revision_requested";

  if (!isWaiting) {
    return (
      <section aria-labelledby="delivery-heading" className="rounded-card bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="delivery-heading" className="text-base font-medium">
            Dev&apos;s Delivery{latest?.attempt === 2 ? ", revised" : ""}
          </h2>
          {state === "delivered" && (
            <button
              type="button"
              onClick={() => startJudging(async () => void (await judgeAgainAction(dealId)))}
              disabled={isJudging}
              className="press h-9 rounded-control bg-raised px-3 text-sm disabled:opacity-60"
            >
              {isJudging ? "The Arbiter is reading…" : "Ask the Arbiter again"}
            </button>
          )}
        </div>
        {latest && (
          <div className="mt-4 max-h-80 overflow-y-auto rounded-card bg-ground p-5 leading-relaxed whitespace-pre-wrap">
            {latest.content}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="delivery-heading" className="rounded-card bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="delivery-heading" className="text-base font-medium">
          {isRevision ? "Revised Delivery" : "Delivery"}
        </h2>
        <p className="text-sm text-muted">Due within {deadlineHours} hours of the Hold</p>
      </div>

      {isRevision && (
        <p className="mt-2 max-w-prose">
          The first Delivery passed none of the criteria. Dev gets one revision; if it also passes none, the Hold is
          voided and Maya pays nothing.
        </p>
      )}

      {canDeliver ? (
        <form action={submit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Load a sample:</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample.kind}
                type="button"
                onClick={() => {
                  if (textarea.current) textarea.current.value = SAMPLE_DELIVERIES[sample.kind];
                }}
                className="press h-8 rounded-control bg-raised px-3 text-sm"
              >
                {sample.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="delivery">
            Delivery text
          </label>
          <textarea
            ref={textarea}
            id="delivery"
            name="delivery"
            rows={10}
            required
            minLength={20}
            maxLength={20000}
            placeholder="Paste the finished copy here."
            className="w-full resize-y rounded-card border border-border bg-surface p-4 leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSubmitting ? "Submitted. The Arbiter is reading…" : "Submit for the Verdict"}
            </button>
            <p className="text-sm text-muted">
              The Arbiter sees only the criteria and this text, never the price or either side&apos;s limits.
            </p>
          </div>
          {submitState.error && <p role="alert" className="text-sm text-negative">{submitState.error}</p>}
        </form>
      ) : (
        <p className="mt-4 text-muted">
          Waiting for Dev to deliver{attempt > 0 ? " the revision" : ""}. Nothing has been paid yet.
        </p>
      )}
    </section>
  );
}
