/**
 * Live end-to-end check of the AI pieces on the demo Deal, no UI and no money:
 * Brief → criteria, a full Agent negotiation, then the Arbiter on every sample
 * Delivery (including a prompt-injection one).
 *   pnpm check:agents
 */
import { createAgentTurn } from "../src/agents/agent-turn";
import { judgeDelivery } from "../src/arbiter/judge";
import { deriveCriteria } from "../src/briefs/derive-criteria";
import { runNegotiation } from "../src/negotiation/run";
import { planSettlement } from "../src/settlement/plan";
import {
  DEMO_BRIEF,
  DEMO_CLIENT_MANDATE,
  DEMO_FREELANCER_MANDATE,
  SAMPLE_DELIVERIES,
} from "../src/samples/demo";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main(): Promise<void> {
  const { criteria, suggestedWeights } = await deriveCriteria({ brief: DEMO_BRIEF });
  console.log("■ Criteria");
  for (const c of criteria) console.log(`  ${suggestedWeights[c.id] / 100}%  ${c.id}: ${c.text}`);

  console.log("\n■ Negotiation");
  const outcome = await runNegotiation({
    brief: DEMO_BRIEF,
    criteria,
    mandates: { client: DEMO_CLIENT_MANDATE, freelancer: DEMO_FREELANCER_MANDATE },
    turns: { client: createAgentTurn(), freelancer: createAgentTurn() },
    onMessage: async (m) => {
      const terms = m.terms ? ` ${dollars(m.terms.priceCents)} / ${m.terms.deadlineHours}h` : "";
      const flag = m.accepted ? "" : `  ✘ rejected: ${m.violations.map((v) => v.message).join("; ")}`;
      console.log(`  R${m.round} ${m.from.padEnd(10)} ${m.kind}${terms} — ${m.rationale}${flag}`);
    },
  });
  console.log(`  → ${JSON.stringify(outcome)}`);
  if (outcome.kind !== "agreed") {
    process.exitCode = 1;
    return;
  }

  console.log("\n■ Arbiter");
  for (const [kind, delivery] of Object.entries(SAMPLE_DELIVERIES)) {
    const verdict = await judgeDelivery({ criteria, delivery, attempt: 1 });
    const plan = planSettlement({ priceCents: outcome.terms.priceCents, weights: outcome.terms.weights, verdict });
    const marks = verdict.results.map((r) => `${r.passed ? "✔" : "✘"} ${r.criterionId}`).join("  ");
    const money = "captureCents" in plan ? `capture ${dollars(plan.captureCents)}, payout ${dollars(plan.payoutCents)}` : "";
    console.log(`  ${kind.padEnd(9)} ${plan.kind.padEnd(8)} ${money}\n            ${marks}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
