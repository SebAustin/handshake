"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { NegotiationStreamEvent } from "@/app/api/deals/[id]/negotiate/route";
import type { Criterion, Role, Terms } from "@/deals/model";
import type { DealState } from "@/deals/state-machine";
import { MAX_ROUNDS, type NegotiationMessage } from "@/negotiation/protocol";
import { criterionLabel, formatCents, formatPercent } from "@/lib/format";
import { ConvergenceChart } from "./ConvergenceChart";
import { PartyLabel } from "./MandatePanel";

interface NegotiationViewProps {
  dealId: string;
  state: DealState;
  criteria: readonly Criterion[];
  messages: readonly NegotiationMessage[];
  canStart: boolean;
  agreedTerms?: Terms;
  ownLimit?: { role: Role; cents: number };
}

const POLL_MS = 2500;

/** The live negotiation: both Agents side by side per Round, streamed as they speak. */
export function NegotiationView({ dealId, state, criteria, messages, canStart, agreedTerms, ownLimit }: NegotiationViewProps) {
  const router = useRouter();
  const [live, setLive] = useState<NegotiationMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string>();

  // Someone else's request is running the negotiation: follow it by refreshing.
  useEffect(() => {
    if (state !== "negotiating" || isStreaming) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [state, isStreaming, router]);

  async function start() {
    setIsStreaming(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/deals/${dealId}/negotiate`, { method: "POST" });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not start the negotiation.");
      }
      await readEvents(response.body, (event) => {
        if (event.type === "message") setLive((current) => [...current, event.message]);
        if (event.type === "error") setError(event.message);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the negotiation.");
    } finally {
      setIsStreaming(false);
      setLive([]);
      router.refresh();
    }
  }

  const shown = [...messages, ...live];
  const rounds = groupByRound(shown);

  return (
    <section aria-labelledby="negotiation-heading" className="flex flex-col gap-4 rounded-card bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="negotiation-heading" className="text-base font-medium">
          Negotiation
        </h2>
        <p className="text-sm text-muted">
          {isStreaming || state === "negotiating"
            ? "The Agents are talking. Each Offer is checked against its side's limits first."
            : `Up to ${MAX_ROUNDS} Rounds. Maya's Agent opens each one.`}
        </p>
      </div>

      {canStart && shown.length === 0 && !isStreaming && (
        <div className="flex flex-wrap items-center gap-4 rounded-card bg-ground p-5">
          <button
            type="button"
            onClick={start}
            className="press h-10 rounded-control bg-accent px-4 text-sm font-medium text-white"
          >
            Let the Agents negotiate
          </button>
          <p className="text-muted">Takes about a minute. Nobody needs to click while it runs.</p>
        </div>
      )}

      {shown.length > 0 && (
        <ConvergenceChart messages={shown} maxRounds={MAX_ROUNDS} agreedCents={agreedTerms?.priceCents} ownLimit={ownLimit} />
      )}

      {rounds.length > 0 && (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[56px_1fr_1fr] gap-4 pb-2 md:grid">
            <span />
            <PartyLabel role="client" suffix="Agent" />
            <PartyLabel role="freelancer" suffix="Agent" />
          </div>
          {rounds.map(([round, byRole]) => (
            <div key={round} className="grid gap-3 border-t border-rule py-3 md:grid-cols-[56px_1fr_1fr] md:gap-4">
              <span className="text-sm text-muted md:pt-1">Round {round}</span>
              <MessageCell messages={byRole.client} criteria={criteria} />
              <MessageCell messages={byRole.freelancer} criteria={criteria} />
            </div>
          ))}
        </div>
      )}

      {isStreaming && <p className="text-sm text-muted" aria-live="polite">Waiting for the next move…</p>}
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {state === "no_deal" && (
        <p className="rounded-card bg-ground p-4">
          No Deal. The Agents could not meet inside both sets of limits, so no money was held.
        </p>
      )}
    </section>
  );
}

function MessageCell({ messages, criteria }: { messages: NegotiationMessage[]; criteria: readonly Criterion[] }) {
  if (messages.length === 0) return <div aria-hidden="true" className="hidden md:block" />;
  return (
    <div className="flex flex-col gap-2">
      {messages.map((message, i) => (
        <MessageCard key={i} message={message} criteria={criteria} />
      ))}
    </div>
  );
}

function MessageCard({ message, criteria }: { message: NegotiationMessage; criteria: readonly Criterion[] }) {
  const who = message.from === "client" ? "Maya's Agent" : "Dev's Agent";
  const verb = { offer: "offers", accept: "accepts", walk_away: "walks away" }[message.kind];
  return (
    <article
      className={`rise rounded-card p-4 ${message.accepted ? "bg-ground" : "border border-dashed border-control bg-surface opacity-80"}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-muted">
          <span className="md:hidden">{who} </span>
          {verb}
        </span>
        {message.terms && (
          <span className="figures text-lg font-bold">
            {formatCents(message.terms.priceCents)}
            <span className="ml-2 text-sm font-normal text-muted">{message.terms.deadlineHours} h</span>
          </span>
        )}
      </header>
      <p className="mt-1.5">{message.rationale}</p>
      {message.terms && message.kind === "offer" && <WeightBar terms={message.terms} criteria={criteria} />}
      {!message.accepted && (
        <p className="mt-2 text-sm text-negative">
          Blocked by the platform: {message.violations.map((v) => v.message).join("; ")}
        </p>
      )}
    </article>
  );
}

/** Each criterion's share of the price, in ink. Ordered as the criteria were approved. */
function WeightBar({ terms, criteria }: { terms: Terms; criteria: readonly Criterion[] }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      {criteria.map((c) => {
        const bp = terms.weights[c.id] ?? 0;
        return (
          <div key={c.id} className="flex flex-col gap-1">
            <dt className="truncate text-muted">{criterionLabel(c.id)}</dt>
            <dd className="flex items-center gap-2">
              <span className="h-1.5 flex-1 rounded-full bg-raised">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${bp / 100}%` }} />
              </span>
              <span className="figures w-9 text-right">{formatPercent(bp)}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function groupByRound(messages: readonly NegotiationMessage[]) {
  const rounds = new Map<number, Record<Role, NegotiationMessage[]>>();
  for (const m of messages) {
    const entry = rounds.get(m.round) ?? { client: [], freelancer: [] };
    entry[m.from].push(m);
    rounds.set(m.round, entry);
  }
  return [...rounds.entries()].sort(([a], [b]) => a - b);
}

async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: NegotiationStreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as NegotiationStreamEvent);
  }
}
