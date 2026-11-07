/**
 * Fixed-window rate limiting with weighted requests. A request spends `cost`
 * units against every limit it is checked against (for example one per IP and
 * one shared by everyone), and is refused when any of them is over budget.
 * The counter is pluggable: Postgres in the app, memory in tests.
 */

export interface Limit {
  key: string;
  limit: number;
  windowMs: number;
}

export interface WindowCounter {
  /** Adds `cost` to the count for (key, window) and returns the new total. */
  add(key: string, window: Date, cost: number): Promise<number>;
}

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export async function checkLimits(
  counter: WindowCounter,
  limits: readonly Limit[],
  cost: number,
  now: Date,
): Promise<LimitResult> {
  let retryAfterMs = 0;
  for (const { key, limit, windowMs } of limits) {
    const start = windowStart(now, windowMs);
    const total = await counter.add(key, start, cost);
    if (total > limit) retryAfterMs = Math.max(retryAfterMs, start.getTime() + windowMs - now.getTime());
  }
  return retryAfterMs > 0 ? { ok: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) } : { ok: true };
}

export function createMemoryCounter(): WindowCounter {
  const counts = new Map<string, number>();
  return {
    async add(key, window, cost) {
      const id = `${key}@${window.toISOString()}`;
      const total = (counts.get(id) ?? 0) + cost;
      counts.set(id, total);
      return total;
    },
  };
}
