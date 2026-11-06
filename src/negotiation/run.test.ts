import { describe, expect, test } from "vitest";
import type { ClientMandate, FreelancerMandate, Role, Terms } from "@/deals/model";
import type { AgentMove } from "./protocol";
import { runNegotiation, type AgentTurn, type TurnInput } from "./run";

const CRITERIA = [
  { id: "headline", text: "Short headline" },
  { id: "tone", text: "Friendly tone" },
];
const CLIENT: ClientMandate = { role: "client", budgetCeilingCents: 12000, maxDeadlineHours: 48, minWeights: {} };
const FREELANCER: FreelancerMandate = {
  role: "freelancer",
  minPriceCents: 9000,
  minDeadlineHours: 24,
  maxWeights: { tone: 4000 },
};

const terms = (priceCents: number, toneBp = 3000, deadlineHours = 36): Terms => ({
  priceCents,
  deadlineHours,
  weights: { headline: 10000 - toneBp, tone: toneBp },
});
const offer = (t: Terms): AgentMove => ({ kind: "offer", terms: t, rationale: "here is my offer" });
const accept: AgentMove = { kind: "accept", rationale: "deal" };
const walkAway: AgentMove = { kind: "walk_away", rationale: "too far apart" };

/** An Agent that plays a fixed script of moves and records what it was shown. */
function scripted(moves: AgentMove[]) {
  const seen: TurnInput[] = [];
  const turn: AgentTurn = async (input) => {
    seen.push(input);
    const move = moves.shift();
    if (!move) throw new Error("script exhausted");
    return move;
  };
  return { turn, seen };
}

async function negotiate(client: AgentMove[], freelancer: AgentMove[], suggestedWeights?: Terms["weights"]) {
  const c = scripted(client);
  const f = scripted(freelancer);
  const messages: { from: Role; kind: string; accepted: boolean; round: number }[] = [];
  const outcome = await runNegotiation({
    brief: "Landing page copy",
    criteria: CRITERIA,
    mandates: { client: CLIENT, freelancer: FREELANCER },
    turns: { client: c.turn, freelancer: f.turn },
    suggestedWeights,
    onMessage: async (m) => {
      messages.push({ from: m.from, kind: m.kind, accepted: m.accepted, round: m.round });
    },
  });
  return { outcome, messages, clientSaw: c.seen, freelancerSaw: f.seen };
}

describe("runNegotiation", () => {
  test("agrees on the Client's Offer when the Freelancer accepts it", async () => {
    const { outcome, messages } = await negotiate([offer(terms(10000))], [accept]);

    expect(outcome).toEqual({ kind: "agreed", terms: terms(10000), rounds: 1 });
    expect(messages).toEqual([
      { from: "client", kind: "offer", accepted: true, round: 1 },
      { from: "freelancer", kind: "accept", accepted: true, round: 1 },
    ]);
  });

  test("converges over several Rounds of counter-offers", async () => {
    const { outcome } = await negotiate(
      [offer(terms(9000)), offer(terms(10000)), accept],
      [offer(terms(11500)), offer(terms(10500))],
    );

    expect(outcome).toEqual({ kind: "agreed", terms: terms(10500), rounds: 3 });
  });

  test("each Agent sees only its own Mandate and the other side's standing Offer", async () => {
    const { freelancerSaw, clientSaw } = await negotiate([offer(terms(10000))], [accept]);

    expect(clientSaw[0]).toMatchObject({ role: "client", mandate: CLIENT, standingOffer: undefined, round: 1 });
    expect(freelancerSaw[0]).toMatchObject({ role: "freelancer", mandate: FREELANCER, standingOffer: terms(10000) });
    expect(JSON.stringify(freelancerSaw[0])).not.toContain("budgetCeilingCents");
  });

  test("only the Client's Agent is told the Client's preferred weights", async () => {
    const preferred = { headline: 8000, tone: 2000 };
    const { clientSaw, freelancerSaw } = await negotiate([offer(terms(10000))], [accept], preferred);

    expect(clientSaw[0].suggestedWeights).toEqual(preferred);
    expect(freelancerSaw[0].suggestedWeights).toBeUndefined();
  });

  test("an out-of-Mandate Offer is rejected, never shown to the other side, and retried with feedback", async () => {
    const { outcome, messages, clientSaw, freelancerSaw } = await negotiate(
      [offer(terms(13000)), offer(terms(11000))],
      [accept],
    );

    expect(messages.map((m) => [m.from, m.kind, m.accepted])).toEqual([
      ["client", "offer", false],
      ["client", "offer", true],
      ["freelancer", "accept", true],
    ]);
    expect(clientSaw[1].feedback).toMatch(/budget/i);
    expect(freelancerSaw[0].transcript.every((m) => m.accepted)).toBe(true);
    expect(outcome).toMatchObject({ kind: "agreed", terms: terms(11000) });
  });

  test("ends without a Deal when an Agent breaks its Mandate twice in a row", async () => {
    const { outcome } = await negotiate([offer(terms(13000)), offer(terms(14000))], []);

    expect(outcome).toMatchObject({ kind: "no_deal", reason: expect.stringMatching(/client.*valid/i) });
  });

  test("an Offer with malformed Terms (zero price, impossible deadline) is rejected", async () => {
    const { messages } = await negotiate(
      [offer({ priceCents: 0, deadlineHours: 0, weights: { headline: 7000, tone: 3000 } }), offer(terms(10000))],
      [accept],
    );

    expect(messages[0]).toMatchObject({ from: "client", kind: "offer", accepted: false });
  });

  test("an accept with nothing to accept is rejected", async () => {
    const { messages } = await negotiate([accept, offer(terms(10000))], [accept]);

    expect(messages[0]).toMatchObject({ from: "client", kind: "accept", accepted: false });
  });

  test("a Freelancer cannot accept terms that break its own Mandate", async () => {
    const { messages, outcome } = await negotiate(
      [offer(terms(10000, 5000)), offer(terms(10000, 4000))],
      [accept, offer(terms(10000, 4000)), accept],
    );

    expect(messages[1]).toMatchObject({ from: "freelancer", kind: "accept", accepted: false });
    expect(outcome).toMatchObject({ kind: "agreed" });
  });

  test("a walk-away ends the negotiation and reports the last Offers", async () => {
    const { outcome } = await negotiate([offer(terms(9000))], [walkAway]);

    expect(outcome).toEqual({
      kind: "no_deal",
      reason: expect.stringMatching(/walked away/i),
      lastOffers: { client: terms(9000) },
    });
  });

  test("gives up after six Rounds without agreement", async () => {
    const six = Array.from({ length: 6 }, () => offer(terms(9000)));
    const sixHigh = Array.from({ length: 6 }, () => offer(terms(12000)));

    const { outcome, messages } = await negotiate(six, sixHigh);

    expect(messages).toHaveLength(12);
    expect(outcome).toEqual({
      kind: "no_deal",
      reason: expect.stringMatching(/6 Rounds/),
      lastOffers: { client: terms(9000), freelancer: terms(12000) },
    });
  });
});
