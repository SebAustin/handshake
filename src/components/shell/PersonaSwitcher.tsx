"use client";

import { useTransition } from "react";
import { setPersonaAction } from "@/app/deals/actions";
import type { Role } from "@/deals/model";

const OPTIONS: { role: Role; name: string; title: string }[] = [
  { role: "client", name: "Maya", title: "Client" },
  { role: "freelancer", name: "Dev", title: "Freelancer" },
];

/** Demo identity: choose whose side of the Deal you are looking at. */
export function PersonaSwitcher({ persona }: { persona: Role }) {
  const [isPending, startTransition] = useTransition();

  return (
    <fieldset className="order-last flex w-full gap-1 lg:order-none lg:flex-col" disabled={isPending}>
      <legend className="sr-only mb-2 text-xs text-muted lg:not-sr-only">Viewing as</legend>
      {OPTIONS.map((option) => {
        const isActive = option.role === persona;
        const tint = option.role === "client" ? "bg-client-tint text-client-ink" : "bg-freelancer-tint text-freelancer-ink";
        return (
          <button
            key={option.role}
            type="button"
            aria-pressed={isActive}
            onClick={() => startTransition(() => setPersonaAction(option.role))}
            className={`press flex h-9 flex-1 items-center gap-2.5 rounded-control px-2 text-left lg:flex-none ${
              isActive ? "bg-raised text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <span className={`grid size-6 place-items-center rounded-full text-xs font-medium ${tint}`}>
              {option.name[0]}
            </span>
            <span className="text-sm">
              {option.name} <span className="text-muted">· {option.title}</span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
