import { describe, expect, test } from "vitest";
import { checkLimits, createMemoryCounter, windowStart, type Limit } from "./limiter";

const HOUR = 3_600_000;
const at = (ms: number) => new Date(Date.UTC(2026, 10, 10, 12, 0, 0) + ms);

describe("windowStart", () => {
  test("aligns to fixed windows", () => {
    expect(windowStart(at(25 * 60_000), HOUR).toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(windowStart(at(HOUR + 1), HOUR).toISOString()).toBe("2026-11-10T13:00:00.000Z");
  });
});

describe("checkLimits", () => {
  const perIp: Limit = { key: "ai:ip:1.2.3.4", limit: 10, windowMs: HOUR };
  const global: Limit = { key: "ai:all", limit: 25, windowMs: HOUR };

  test("allows requests until the weighted budget is spent", async () => {
    const counter = createMemoryCounter();
    expect(await checkLimits(counter, [perIp], 6, at(0))).toEqual({ ok: true });
    expect(await checkLimits(counter, [perIp], 4, at(1000))).toEqual({ ok: true });
    expect(await checkLimits(counter, [perIp], 1, at(2000))).toEqual({ ok: false, retryAfterSeconds: 3598 });
  });

  test("a new window starts fresh", async () => {
    const counter = createMemoryCounter();
    await checkLimits(counter, [perIp], 10, at(0));
    expect(await checkLimits(counter, [perIp], 1, at(HOUR))).toEqual({ ok: true });
  });

  test("the global limit stops traffic spread across many addresses", async () => {
    const counter = createMemoryCounter();
    for (let i = 0; i < 4; i++) {
      await checkLimits(counter, [{ ...perIp, key: `ai:ip:10.0.0.${i}` }, global], 6, at(i));
    }
    const result = await checkLimits(counter, [{ ...perIp, key: "ai:ip:10.0.0.9" }, global], 6, at(10));
    expect(result.ok).toBe(false);
  });

  test("other keys are unaffected", async () => {
    const counter = createMemoryCounter();
    await checkLimits(counter, [perIp], 10, at(0));
    expect(await checkLimits(counter, [{ ...perIp, key: "ai:ip:5.6.7.8" }], 1, at(0))).toEqual({ ok: true });
  });
});
