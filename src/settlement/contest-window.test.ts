import { describe, expect, test } from "vitest";
import { contestWindow, CONTEST_WINDOW_MS } from "./contest-window";

const VERDICT_AT = "2026-11-06T22:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(VERDICT_AT) + ms);

describe("contestWindow", () => {
  test("is open until the window elapses", () => {
    expect(contestWindow({ verdictAt: VERDICT_AT, waivers: [] }, at(1_000))).toEqual({
      isOpen: true,
      closesAt: at(CONTEST_WINDOW_MS).toISOString(),
      remainingMs: CONTEST_WINDOW_MS - 1_000,
    });
  });

  test("closes once the window has elapsed", () => {
    expect(contestWindow({ verdictAt: VERDICT_AT, waivers: [] }, at(CONTEST_WINDOW_MS))).toMatchObject({
      isOpen: false,
      remainingMs: 0,
    });
  });

  test("closes early only when both sides have waived", () => {
    expect(contestWindow({ verdictAt: VERDICT_AT, waivers: ["client"] }, at(1_000)).isOpen).toBe(true);
    expect(contestWindow({ verdictAt: VERDICT_AT, waivers: ["client", "freelancer"] }, at(1_000)).isOpen).toBe(false);
  });

  test("treats a missing Verdict time as already elapsed", () => {
    expect(contestWindow({ waivers: [] }, at(0)).isOpen).toBe(false);
  });
});
