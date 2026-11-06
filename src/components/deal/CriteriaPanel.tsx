"use client";

import { useActionState } from "react";
import { approveCriteriaAction, draftCriteriaAction, type ActionState } from "@/app/deals/actions";
import type { Criterion, Weights } from "@/deals/model";
import { criterionLabel, formatPercent } from "@/lib/format";

interface CriteriaPanelProps {
  dealId: string;
  draft?: { criteria: readonly Criterion[]; suggestedWeights: Weights };
  canEdit: boolean;
}

/** Brief → criteria: Maya's Agent drafts, Maya edits and approves. */
export function CriteriaPanel({ dealId, draft, canEdit }: CriteriaPanelProps) {
  const [draftState, draftAction, isDrafting] = useActionState<ActionState, FormData>(
    () => draftCriteriaAction(dealId),
    {},
  );
  const [approveState, approveAction, isApproving] = useActionState<ActionState, FormData>(
    approveCriteriaAction.bind(null, dealId),
    {},
  );

  if (!draft) {
    return (
      <section aria-labelledby="criteria-heading" className="rounded-card bg-surface p-6">
        <h2 id="criteria-heading" className="text-base font-medium">
          Acceptance criteria
        </h2>
        <p className="mt-1 max-w-prose text-muted">
          The Arbiter will judge the Delivery only against these, each one pass or fail, so every criterion must be
          checkable from the text alone.
        </p>
        {canEdit ? (
          <form action={draftAction} className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={isDrafting}
              className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {isDrafting ? "Your Agent is reading the Brief…" : "Draft criteria with my Agent"}
            </button>
            {draftState.error && <p role="alert" className="text-sm text-negative">{draftState.error}</p>}
          </form>
        ) : (
          <p className="mt-5 text-muted">Maya&apos;s Agent hasn&apos;t drafted them yet.</p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="criteria-heading" className="rounded-card bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="criteria-heading" className="text-base font-medium">
          Acceptance criteria, drafted by Maya&apos;s Agent
        </h2>
        <p className="text-sm text-muted">Weights are the Agent&apos;s opening position; they are negotiated next.</p>
      </div>

      <form action={approveAction} className="mt-5 flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {draft.criteria.map((criterion) => (
            <li key={criterion.id} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{criterionLabel(criterion.id)}</span>
                <textarea
                  name={`criterion-${criterion.id}`}
                  defaultValue={criterion.text}
                  readOnly={!canEdit}
                  rows={3}
                  className="w-full resize-y rounded-control border border-border bg-surface p-3 leading-relaxed read-only:bg-ground"
                />
              </label>
              <span className="figures text-sm text-muted sm:pt-7">
                {formatPercent(draft.suggestedWeights[criterion.id] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isApproving}
              className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {isApproving ? "Approving…" : "Approve criteria"}
            </button>
            <button
              type="submit"
              formAction={draftAction}
              disabled={isDrafting}
              className="press h-10 rounded-control bg-raised px-4 text-sm disabled:opacity-60"
            >
              {isDrafting ? "Redrafting…" : "Redraft"}
            </button>
            {(approveState.error ?? draftState.error) && (
              <p role="alert" className="text-sm text-negative">
                {approveState.error ?? draftState.error}
              </p>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
