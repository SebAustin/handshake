import { afterAll, describe, expect, test } from "vitest";
import { like } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { checkLimits } from "./limiter";
import { createPostgresCounter } from "./postgres-counter";

const { db, close } = createDatabase(process.env.DATABASE_URL ?? "");
const prefix = `test-${crypto.randomUUID()}`;
const counter = createPostgresCounter(db);

afterAll(async () => {
  await db.delete(rateLimits).where(like(rateLimits.key, `${prefix}%`));
  await close();
});

describe("Postgres window counter", () => {
  test("concurrent adds never lose a count", async () => {
    const window = new Date(Date.UTC(2026, 10, 10, 12));
    const totals = await Promise.all(Array.from({ length: 20 }, () => counter.add(`${prefix}:race`, window, 1)));
    expect(Math.max(...totals)).toBe(20);
    expect(new Set(totals).size).toBe(20);
  });

  test("enforces a limit end to end", async () => {
    const limit = { key: `${prefix}:ip`, limit: 3, windowMs: 3_600_000 };
    const now = new Date();
    expect((await checkLimits(counter, [limit], 2, now)).ok).toBe(true);
    expect((await checkLimits(counter, [limit], 1, now)).ok).toBe(true);
    expect((await checkLimits(counter, [limit], 1, now)).ok).toBe(false);
  });
});
