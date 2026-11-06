import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { deliveries } from "@/db/schema";
import type { DeliveryAttempt } from "@/deals/model";

/** Deliveries are stored apart from the Deal row: they are large and the Arbiter reads them alone. */
export function createDeliveryStore(db: Database) {
  return {
    /** Saves the attempt's text; resubmitting the same attempt (a retry) replaces it. */
    async save(dealId: string, attempt: DeliveryAttempt, content: string): Promise<void> {
      await db
        .insert(deliveries)
        .values({ dealId, attempt, content })
        .onConflictDoUpdate({ target: [deliveries.dealId, deliveries.attempt], set: { content } });
    },

    async get(dealId: string, attempt: DeliveryAttempt): Promise<string | null> {
      const [row] = await db
        .select({ content: deliveries.content })
        .from(deliveries)
        .where(and(eq(deliveries.dealId, dealId), eq(deliveries.attempt, attempt)))
        .limit(1);
      return row?.content ?? null;
    },

    async latest(dealId: string): Promise<{ attempt: DeliveryAttempt; content: string } | null> {
      const [row] = await db
        .select({ attempt: deliveries.attempt, content: deliveries.content })
        .from(deliveries)
        .where(eq(deliveries.dealId, dealId))
        .orderBy(desc(deliveries.attempt))
        .limit(1);
      return row ?? null;
    },
  };
}

export type DeliveryStore = ReturnType<typeof createDeliveryStore>;
