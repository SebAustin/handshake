"use client";

import { useActionState } from "react";
import { createDealAction, type ActionState } from "@/app/deals/actions";

export function NewDealForm({ defaultBrief }: { defaultBrief: string }) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(createDealAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="brief" className="text-sm font-medium">
        Maya&apos;s Brief
      </label>
      <textarea
        id="brief"
        name="brief"
        rows={5}
        required
        minLength={30}
        maxLength={4000}
        defaultValue={defaultBrief}
        className="min-h-56 w-full resize-y rounded-card border border-border bg-surface p-4 text-base leading-relaxed sm:min-h-0"
      />
      {state.error && (
        <p role="alert" className="text-sm text-negative">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="press h-11 shrink-0 whitespace-nowrap rounded-control bg-accent px-5 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Opening the Deal…" : "Open the Deal"}
        </button>
        <p className="text-sm text-muted">You start as Maya. Switch to Dev any time.</p>
      </div>
    </form>
  );
}
