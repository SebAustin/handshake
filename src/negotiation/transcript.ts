import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { negotiationMessages } from "@/db/schema";
import { PROTOCOL_VERSION, type NegotiationMessage } from "./protocol";

/** Append-only store of every negotiation message, valid or rejected, in the order it happened. */
export function createTranscriptStore(db: Database) {
  return {
    async append(dealId: string, message: NegotiationMessage): Promise<void> {
      await db.insert(negotiationMessages).values({
        dealId,
        round: message.round,
        fromRole: message.from,
        kind: message.kind,
        terms: message.terms ?? null,
        rationale: message.rationale,
        violations: message.violations,
        accepted: message.accepted,
      });
    },

    async list(dealId: string): Promise<NegotiationMessage[]> {
      const rows = await db
        .select()
        .from(negotiationMessages)
        .where(eq(negotiationMessages.dealId, dealId))
        .orderBy(asc(negotiationMessages.id));
      return rows.map((row) => ({
        protocol: PROTOCOL_VERSION,
        round: row.round,
        from: row.fromRole,
        kind: row.kind,
        ...(row.terms && { terms: row.terms }),
        rationale: row.rationale,
        violations: row.violations,
        accepted: row.accepted,
      }));
    },
  };
}

export type TranscriptStore = ReturnType<typeof createTranscriptStore>;
