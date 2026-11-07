import { createAgentTurn } from "@/agents/agent-turn";
import type { NegotiationMessage, NegotiationOutcome } from "@/negotiation/protocol";
import { runNegotiation } from "@/negotiation/run";
import { getServices } from "@/server/context";
import { COST, limitMessage, rateLimit } from "@/server/rate-limit";

/**
 * Runs a whole negotiation in one streaming request (PLAN.md, Nov 6). Each
 * message is saved before it is streamed, so a reload replays the transcript.
 * NEGOTIATION_STARTED is the lock: a second request for the same Deal fails it
 * and gets 409. The run continues even if the browser disconnects.
 */

export const maxDuration = 300;

export type NegotiationStreamEvent =
  | { type: "message"; message: NegotiationMessage }
  | { type: "outcome"; outcome: NegotiationOutcome }
  | { type: "error"; message: string };

export async function POST(_request: Request, ctx: RouteContext<"/api/deals/[id]/negotiate">) {
  const { id } = await ctx.params;
  const { deals, transcript } = getServices();
  const stored = await deals.get(id);
  if (!stored) return Response.json({ error: "Unknown Deal" }, { status: 404 });

  const { client, freelancer } = stored.deal.pendingMandates ?? {};
  if (!client || !freelancer) {
    return Response.json({ error: "Both Mandates must be set first" }, { status: 409 });
  }
  // Checked before NEGOTIATION_STARTED, so a refused request leaves the Deal ready to try again.
  const allowed = await rateLimit("ai", COST.negotiation);
  if (!allowed.ok) {
    return Response.json(
      { error: limitMessage(allowed) },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfterSeconds) } },
    );
  }
  const started = await deals.applyEvent(id, { type: "NEGOTIATION_STARTED", client, freelancer });
  if (!started.ok) return Response.json({ error: started.error.message }, { status: 409 });

  const deal = started.deal;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: NegotiationStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the browser went away; keep negotiating and saving
        }
      };

      try {
        const outcome = await runNegotiation({
          brief: deal.brief,
          criteria: deal.criteria,
          mandates: { client, freelancer },
          suggestedWeights: deal.suggestedWeights,
          turns: { client: createAgentTurn(), freelancer: createAgentTurn() },
          onMessage: async (message) => {
            await transcript.append(id, message);
            send({ type: "message", message });
          },
        });
        const recorded = await deals.applyEvent(
          id,
          outcome.kind === "agreed" ? { type: "AGREEMENT_REACHED", terms: outcome.terms } : { type: "NEGOTIATION_FAILED" },
          { payload: outcome.kind === "no_deal" ? { reason: outcome.reason } : { rounds: outcome.rounds } },
        );
        if (!recorded.ok) throw new Error(recorded.error.message);
        send({ type: "outcome", outcome });
      } catch (error) {
        console.error(`Negotiation for ${id} failed`, error);
        await deals.applyEvent(id, { type: "NEGOTIATION_FAILED" }, { payload: { reason: "error" } });
        send({ type: "error", message: "The negotiation stopped unexpectedly. Start a new Deal to try again." });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
