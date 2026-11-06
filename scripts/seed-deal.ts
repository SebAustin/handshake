/**
 * Seeds a Deal straight to a later stage through the real state machine, with
 * fixed criteria and Terms, so UI paths can be tested without the AI steps.
 *
 *   pnpm seed:deal agreed        # ready for a real PayPal Hold
 *   pnpm seed:deal held-no-money # placeholder Hold: only for paths that never call PayPal (Contest)
 *   pnpm seed:deal judged-no-money # placeholder Hold, revision failed too: Contest Window open on a void Verdict
 */
import { createDatabase } from "../src/db/client";
import { createDealRepository } from "../src/deals/repository";
import { createDeal, type DealEvent } from "../src/deals/state-machine";
import { DEMO_BRIEF, DEMO_CLIENT_MANDATE, DEMO_FREELANCER_MANDATE } from "../src/samples/demo";

const CRITERIA = [
  { id: "word-count-range", text: "The landing page copy is between 120 and 199 words in total, counting headline, body and call to action." },
  { id: "punchy-headline", text: "The copy opens with a single headline of 10 words or fewer that mentions Brewlab, coffee or remote teams." },
  { id: "three-concrete-benefits", text: "The copy presents exactly three distinct benefits, each naming something specific about the subscription." },
  { id: "free-trial-cta", text: "The copy ends with a clear call to action that uses the words 'free trial' and an imperative verb." },
  { id: "friendly-expert-tone", text: "The copy addresses the reader directly ('you'/'your') and includes at least one specific coffee detail." },
];
const WEIGHTS = { "word-count-range": 1500, "punchy-headline": 2000, "three-concrete-benefits": 2500, "free-trial-cta": 2000, "friendly-expert-tone": 2000 };
const TERMS = { priceCents: 10_000, deadlineHours: 30, weights: WEIGHTS };

async function main(): Promise<void> {
  const until = process.argv[2];
  const modes = ["agreed", "held-no-money", "judged-no-money"];
  if (!modes.includes(until ?? "")) throw new Error(`Usage: pnpm seed:deal ${modes.join(" | ")}`);

  const id = `d-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const brief = until === "agreed" ? DEMO_BRIEF : `[Test, no money] ${DEMO_BRIEF}`;
  const events: DealEvent[] = [
    { type: "CRITERIA_APPROVED", criteria: CRITERIA, suggestedWeights: WEIGHTS },
    { type: "MANDATE_SET", mandate: DEMO_CLIENT_MANDATE },
    { type: "MANDATE_SET", mandate: DEMO_FREELANCER_MANDATE },
    { type: "NEGOTIATION_STARTED", client: DEMO_CLIENT_MANDATE, freelancer: DEMO_FREELANCER_MANDATE },
    { type: "AGREEMENT_REACHED", terms: TERMS },
  ];
  if (until !== "agreed") {
    events.push(
      { type: "HOLD_REQUESTED", orderId: "TESTNOPAYPAL0001" },
      { type: "HOLD_PLACED", authorizationId: "TESTNOPAYPAL0001", amountCents: TERMS.priceCents },
    );
  }

  if (until === "judged-no-money") {
    const failedAll = (attempt: 1 | 2) => ({
      attempt,
      results: CRITERIA.map((c) => ({ criterionId: c.id, passed: false, reason: "Seeded: not met.", evidence: "" })),
    });
    events.push(
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: failedAll(1), at: new Date(Date.now() - 60_000).toISOString() },
      { type: "CONTEST_WINDOW_CLOSED" },
      { type: "DELIVERY_SUBMITTED" },
      { type: "VERDICT_ISSUED", verdict: failedAll(2), at: new Date().toISOString() },
    );
  }

  const { db, close } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    const deals = createDealRepository(db);
    await deals.create(createDeal({ id, brief }));
    for (const event of events) {
      const result = await deals.applyEvent(id, event, { payload: { seeded: true } });
      if (!result.ok) throw new Error(`${event.type}: ${result.error.message}`);
    }
    console.log(`Seeded ${id} (${until}) → http://localhost:3000/deals/${id}`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
