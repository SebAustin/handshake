import { lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { rateLimits } from "@/db/schema";
import type { WindowCounter } from "./limiter";

const KEEP_WINDOWS_MS = 24 * 3_600_000;

/** Atomic per-window counter: one upsert per check, safe under concurrent requests. */
export function createPostgresCounter(db: Database): WindowCounter {
  return {
    async add(key, window, cost) {
      const [row] = await db
        .insert(rateLimits)
        .values({ key, windowStart: window, count: cost })
        .onConflictDoUpdate({
          target: [rateLimits.key, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + ${cost}` },
        })
        .returning({ count: rateLimits.count });
      // Prune old windows now and then, so the table stays small without a cron.
      if (Math.random() < 0.02) {
        await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(window.getTime() - KEEP_WINDOWS_MS)));
      }
      return row?.count ?? cost;
    },
  };
}
