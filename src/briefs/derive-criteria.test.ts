import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import { deriveCriteria, normalizeWeights, toCriterionIds } from "./derive-criteria";

const BRIEF = "I need landing page copy for Brewlab, a coffee subscription for remote teams. Friendly but expert.";

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

const GOOD_OUTPUT = {
  criteria: [
    { name: "Headline", text: "Headline is under 10 words", weightPercent: 40 },
    { name: "Tone", text: "Tone is friendly but expert", weightPercent: 30 },
    { name: "Call to action", text: "Ends with one clear call to action", weightPercent: 20 },
    { name: "Length", text: "Body copy is 150–250 words", weightPercent: 10 },
  ],
};

describe("normalizeWeights", () => {
  test("converts percentages to basis points summing to 10 000", () => {
    expect(normalizeWeights([40, 30, 20, 10])).toEqual([4000, 3000, 2000, 1000]);
  });

  test("distributes rounding remainders so the total is exact", () => {
    const weights = normalizeWeights([1, 1, 1]);

    expect(weights).toEqual([3334, 3333, 3333]);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  test("rescales suggestions that do not add up to 100", () => {
    expect(normalizeWeights([50, 50, 50, 50])).toEqual([2500, 2500, 2500, 2500]);
  });

  test("rejects empty, zero or negative suggestions", () => {
    expect(() => normalizeWeights([])).toThrow();
    expect(() => normalizeWeights([0, 0])).toThrow();
    expect(() => normalizeWeights([10, -5])).toThrow();
  });
});

describe("toCriterionIds", () => {
  test("slugifies names and de-duplicates collisions", () => {
    expect(toCriterionIds(["Call to action", "Tone", "tone", "Tône!!"])).toEqual([
      "call-to-action",
      "tone",
      "tone-2",
      "tone-3",
    ]);
  });

  test("falls back to a positional id when a name has no usable characters", () => {
    expect(toCriterionIds(["!!!", "Tone"])).toEqual(["criterion-1", "tone"]);
  });
});

describe("deriveCriteria", () => {
  test("turns a Brief into criteria with ids and weights in basis points", async () => {
    const { model } = mockModel(GOOD_OUTPUT);

    const result = await deriveCriteria({ brief: BRIEF, model });

    expect(result.criteria).toEqual([
      { id: "headline", text: "Headline is under 10 words" },
      { id: "tone", text: "Tone is friendly but expert" },
      { id: "call-to-action", text: "Ends with one clear call to action" },
      { id: "length", text: "Body copy is 150–250 words" },
    ]);
    expect(result.suggestedWeights).toEqual({ headline: 4000, tone: 3000, "call-to-action": 2000, length: 1000 });
  });

  test("sends the Brief as delimited data, not as instructions", async () => {
    const { model, doGenerate } = mockModel(GOOD_OUTPUT);

    await deriveCriteria({ brief: BRIEF, model });

    const prompt = JSON.stringify(doGenerate.mock.calls[0]);
    expect(prompt).toContain("<brief>");
    expect(prompt).toContain(BRIEF);
  });

  test("rejects a Brief that is too short without calling the model", async () => {
    const { model, doGenerate } = mockModel(GOOD_OUTPUT);

    await expect(deriveCriteria({ brief: "copy pls", model })).rejects.toThrow(/brief/i);
    expect(doGenerate).not.toHaveBeenCalled();
  });

  test("rejects model output with too few criteria", async () => {
    const { model } = mockModel({ criteria: GOOD_OUTPUT.criteria.slice(0, 2) });

    await expect(deriveCriteria({ brief: BRIEF, model })).rejects.toThrow();
  });
});
