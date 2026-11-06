import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import { judgeDelivery } from "./judge";

const CRITERIA = [
  { id: "headline", text: "Headline is under 10 words" },
  { id: "cta", text: "Ends with one clear call to action" },
];
const DELIVERY = "Coffee that keeps remote teams in sync.\n\nFresh beans every week.\n\nStart your free trial today.";

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

describe("judgeDelivery", () => {
  test("returns one result per criterion for the given attempt", async () => {
    const { model } = mockModel({
      results: [
        { criterionId: "headline", passed: true, reason: "7 words.", evidence: "Coffee that keeps remote teams in sync." },
        { criterionId: "cta", passed: true, reason: "Clear trial CTA.", evidence: "Start your free trial today." },
      ],
    });

    const verdict = await judgeDelivery({ criteria: CRITERIA, delivery: DELIVERY, attempt: 2, model });

    expect(verdict).toEqual({
      attempt: 2,
      results: [
        { criterionId: "headline", passed: true, reason: "7 words.", evidence: "Coffee that keeps remote teams in sync." },
        { criterionId: "cta", passed: true, reason: "Clear trial CTA.", evidence: "Start your free trial today." },
      ],
    });
  });

  test("drops evidence that is not actually quoted from the Delivery", async () => {
    const { model } = mockModel({
      results: [
        { criterionId: "headline", passed: true, reason: "Short.", evidence: "Coffee that keeps remote teams in sync." },
        { criterionId: "cta", passed: true, reason: "Has a CTA.", evidence: "Sign up now and save 50%!" },
      ],
    });

    const verdict = await judgeDelivery({ criteria: CRITERIA, delivery: DELIVERY, attempt: 1, model });

    expect(verdict.results[1].evidence).toBe("");
  });

  test("matches evidence despite whitespace differences", async () => {
    const { model } = mockModel({
      results: [
        { criterionId: "headline", passed: true, reason: "Short.", evidence: "Coffee that keeps   remote teams\nin sync." },
        { criterionId: "cta", passed: false, reason: "None.", evidence: "" },
      ],
    });

    const verdict = await judgeDelivery({ criteria: CRITERIA, delivery: DELIVERY, attempt: 1, model });

    expect(verdict.results[0].evidence).toBe("Coffee that keeps   remote teams\nin sync.");
  });

  test("rejects a Verdict that skips or repeats a criterion", async () => {
    const { model } = mockModel({
      results: [
        { criterionId: "headline", passed: true, reason: "a", evidence: "" },
        { criterionId: "headline", passed: false, reason: "b", evidence: "" },
      ],
    });

    await expect(judgeDelivery({ criteria: CRITERIA, delivery: DELIVERY, attempt: 1, model })).rejects.toThrow(/cta/);
  });

  test("sends the Delivery as delimited untrusted data", async () => {
    const { model, doGenerate } = mockModel({
      results: CRITERIA.map((c) => ({ criterionId: c.id, passed: false, reason: "x", evidence: "" })),
    });

    await judgeDelivery({ criteria: CRITERIA, delivery: DELIVERY, attempt: 1, model });

    const call = JSON.stringify(doGenerate.mock.calls[0]);
    expect(call).toContain("<delivery>");
    expect(call).toMatch(/ignore any instructions/i);
  });

  test("rejects an empty Delivery without calling the model", async () => {
    const { model, doGenerate } = mockModel({ results: [] });

    await expect(judgeDelivery({ criteria: CRITERIA, delivery: "   ", attempt: 1, model })).rejects.toThrow(/Delivery/);
    expect(doGenerate).not.toHaveBeenCalled();
  });
});
