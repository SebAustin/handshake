import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import type { TurnInput } from "@/negotiation/run";
import { createAgentTurn } from "./agent-turn";

function mockModel(output: unknown) {
  const doGenerate = vi.fn(async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 20, text: 20, reasoning: undefined },
    },
    warnings: [],
  }));
  return { model: new MockLanguageModelV4({ doGenerate }), doGenerate };
}

const FREELANCER_INPUT: TurnInput = {
  role: "freelancer",
  mandate: { role: "freelancer", minPriceCents: 9000, minDeadlineHours: 24, maxWeights: { tone: 3000 } },
  brief: "Landing page copy for Brewlab",
  criteria: [
    { id: "headline", text: "Short headline" },
    { id: "tone", text: "Friendly tone" },
  ],
  round: 2,
  maxRounds: 6,
  transcript: [],
  standingOffer: { priceCents: 8000, deadlineHours: 24, weights: { headline: 5000, tone: 5000 } },
  feedback: "Price 8500¢ is below the minimum 9000¢",
};

const promptOf = (doGenerate: ReturnType<typeof mockModel>["doGenerate"]) => JSON.stringify(doGenerate.mock.calls[0]);

describe("createAgentTurn", () => {
  test("turns an offer from the model into Terms in cents and basis points", async () => {
    const { model } = mockModel({
      kind: "offer",
      priceDollars: 105,
      deadlineHours: 30,
      weightsPercent: [
        { criterionId: "headline", percent: 75 },
        { criterionId: "tone", percent: 25 },
      ],
      rationale: "Happy to start, but tone is subjective so I'd weight it lower.",
    });

    const move = await createAgentTurn(model)(FREELANCER_INPUT);

    expect(move).toEqual({
      kind: "offer",
      terms: { priceCents: 10500, deadlineHours: 30, weights: { headline: 7500, tone: 2500 } },
      rationale: "Happy to start, but tone is subjective so I'd weight it lower.",
    });
  });

  test("passes accept and walk-away through without Terms", async () => {
    const { model } = mockModel({ kind: "accept", rationale: "That works.", priceDollars: null, deadlineHours: null, weightsPercent: null });

    expect(await createAgentTurn(model)(FREELANCER_INPUT)).toEqual({ kind: "accept", rationale: "That works." });
  });

  test("tells the Agent its own limits, the standing Offer and why its last attempt failed", async () => {
    const { model, doGenerate } = mockModel({ kind: "walk_away", rationale: "Too far apart." });

    await createAgentTurn(model)(FREELANCER_INPUT);

    const prompt = promptOf(doGenerate);
    expect(prompt).toContain("$90.00");
    expect(prompt).toContain("tone");
    expect(prompt).toContain("$80.00");
    expect(prompt).toContain("below the minimum");
    expect(prompt).toContain("Round 2 of 6");
  });

  test("an offer missing its Terms becomes an invalid offer that code will reject", async () => {
    const { model } = mockModel({ kind: "offer", rationale: "Let's do it.", priceDollars: null, deadlineHours: 24, weightsPercent: [] });

    const move = await createAgentTurn(model)(FREELANCER_INPUT);

    expect(move).toMatchObject({ kind: "offer", terms: { weights: {} } });
  });
});
