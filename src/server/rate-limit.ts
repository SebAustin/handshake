import "server-only";
import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { checkLimits, type LimitResult } from "@/ratelimit/limiter";
import { createPostgresCounter } from "@/ratelimit/postgres-counter";

/**
 * Rate limits for the public demo, so an open URL can't run up the Claude bill
 * or flood the PayPal sandbox. Budgets are per hour, per visitor IP and for
 * everyone together. Costs roughly follow model calls: a negotiation is about
 * a dozen Agent turns; drafting criteria is one.
 */

const HOUR = 3_600_000;

const BUCKETS = {
  /** Calls that run Claude. */
  ai: { perIp: 40, everyone: 600 },
  /** New Deals and new PayPal orders. */
  deal: { perIp: 15, everyone: 300 },
} as const;

export type Bucket = keyof typeof BUCKETS;

export const COST = { draftCriteria: 1, negotiation: 6, arbiter: 2, newDeal: 1, holdOrder: 1 } as const;

export async function rateLimit(bucket: Bucket, cost: number): Promise<LimitResult> {
  const { perIp, everyone } = BUCKETS[bucket];
  const ip = await clientIp();
  try {
    return await checkLimits(
      createPostgresCounter(getDatabase()),
      [
        { key: `${bucket}:ip:${ip}`, limit: perIp, windowMs: HOUR },
        { key: `${bucket}:all`, limit: everyone, windowMs: HOUR },
      ],
      cost,
      new Date(),
    );
  } catch (error) {
    // A broken counter must not take the demo down: log it and let the request through.
    console.error("Rate limiter unavailable", error);
    return { ok: true };
  }
}

export function limitMessage(result: Extract<LimitResult, { ok: false }>): string {
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
  return `The demo has hit its hourly limit for this. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip") || "local";
}
