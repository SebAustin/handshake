"use client";

import { useActionState, useRef } from "react";
import { setMandateAction, type ActionState } from "@/app/deals/actions";
import type { ClientMandate, FreelancerMandate, Role } from "@/deals/model";
import { DEMO_CLIENT_MANDATE, DEMO_FREELANCER_MANDATE } from "@/samples/demo";

interface MandatePanelProps {
  dealId: string;
  persona: Role;
  /** Only the viewer's own Mandate is ever sent to the browser. */
  ownMandate?: ClientMandate | FreelancerMandate;
  otherIsSet: boolean;
}

const COPY = {
  client: {
    name: "Maya",
    amountLabel: "Budget ceiling",
    amountHelp: "Your Agent will never agree to pay more.",
    hoursLabel: "Need it within",
    hoursHelp: "Hours, at most.",
  },
  freelancer: {
    name: "Dev",
    amountLabel: "Minimum price",
    amountHelp: "Your Agent will never accept less.",
    hoursLabel: "Need at least",
    hoursHelp: "Hours to do the work.",
  },
} as const;

/** Each side sets its Agent's private limits. The other side only sees whether they are set. */
export function MandatePanel({ dealId, persona, ownMandate, otherIsSet }: MandatePanelProps) {
  const other: Role = persona === "client" ? "freelancer" : "client";
  return (
    <section aria-labelledby="mandates-heading" className="rounded-card bg-surface p-6">
      <h2 id="mandates-heading" className="text-base font-medium">
        Limits for each Agent
      </h2>
      <p className="mt-1 max-w-prose text-muted">
        These are the Mandates. Code checks every Offer against them, so an Agent can negotiate but can never break
        them. Neither side sees the other&apos;s.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <MandateForm key={persona} dealId={dealId} role={persona} mandate={ownMandate} />
        <div className="flex flex-col justify-between gap-3 rounded-card bg-ground p-5">
          <PartyLabel role={other} />
          <p className={otherIsSet ? "text-ink" : "text-muted"}>
            {otherIsSet ? "Limits set. Their values stay private." : "Hasn't set limits yet."}
          </p>
        </div>
      </div>
    </section>
  );
}

function MandateForm({ dealId, role, mandate }: { dealId: string; role: Role; mandate?: ClientMandate | FreelancerMandate }) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(setMandateAction.bind(null, dealId, role), {});
  const formRef = useRef<HTMLFormElement>(null);
  const copy = COPY[role];
  const cents = mandate ? ("budgetCeilingCents" in mandate ? mandate.budgetCeilingCents : mandate.minPriceCents) : undefined;
  const hours = mandate ? ("maxDeadlineHours" in mandate ? mandate.maxDeadlineHours : mandate.minDeadlineHours) : undefined;
  const demo = role === "client" ? DEMO_CLIENT_MANDATE : DEMO_FREELANCER_MANDATE;
  const demoCents = "budgetCeilingCents" in demo ? demo.budgetCeilingCents : demo.minPriceCents;
  const demoHours = "maxDeadlineHours" in demo ? demo.maxDeadlineHours : demo.minDeadlineHours;

  function fillDemo() {
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("dollars") as HTMLInputElement).value = String(demoCents / 100);
    (form.elements.namedItem("hours") as HTMLInputElement).value = String(demoHours);
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4 rounded-card border border-border p-5">
      <PartyLabel role={role} suffix="you" />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{copy.amountLabel}</span>
          <span className="flex h-10 items-center rounded-control border border-control bg-surface px-3 focus-within:outline-2 focus-within:outline-data">
            <span className="text-muted">$</span>
            <input
              name="dollars"
              type="number"
              inputMode="decimal"
              min={1}
              step="1"
              required
              defaultValue={cents ? cents / 100 : undefined}
              className="figures w-full bg-transparent pl-1 outline-none"
            />
          </span>
          <span className="text-xs text-muted">{copy.amountHelp}</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{copy.hoursLabel}</span>
          <span className="flex h-10 items-center rounded-control border border-control bg-surface px-3 focus-within:outline-2 focus-within:outline-data">
            <input
              name="hours"
              type="number"
              inputMode="numeric"
              min={1}
              max={72}
              required
              defaultValue={hours}
              className="figures w-full bg-transparent outline-none"
            />
            <span className="text-muted">h</span>
          </span>
          <span className="text-xs text-muted">{copy.hoursHelp}</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Saving…" : mandate ? "Update my limits" : "Set my limits"}
        </button>
        <button type="button" onClick={fillDemo} className="press h-10 rounded-control bg-raised px-3 text-sm">
          Use demo limits
        </button>
        {state.error && <p role="alert" className="text-sm text-negative">{state.error}</p>}
        {mandate && !state.error && <p className="text-sm text-positive">Saved</p>}
      </div>
    </form>
  );
}

export function PartyLabel({ role, suffix }: { role: Role; suffix?: string }) {
  const name = COPY[role].name;
  const tint = role === "client" ? "bg-client-tint text-client-ink" : "bg-freelancer-tint text-freelancer-ink";
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className={`grid size-6 place-items-center rounded-full text-xs font-medium ${tint}`}>{name[0]}</span>
      <span className="font-medium">{name}</span>
      <span className="text-muted">
        · {role === "client" ? "Client" : "Freelancer"}
        {suffix ? ` · ${suffix}` : ""}
      </span>
    </span>
  );
}
