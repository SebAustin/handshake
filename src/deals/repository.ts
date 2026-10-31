import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { deals, ledgerEvents } from "@/db/schema";
import { dealToRow, rowToDeal } from "./row";
import { transition, type Deal, type DealEvent, type DealState, type TransitionError } from "./state-machine";

/**
 * Persists the Deal aggregate. Every change goes through `applyEvent`, which
 * runs the pure state machine, then saves with an optimistic version check and
 * writes the matching ledger event in the same transaction.
 */

const MAX_CONFLICT_RETRIES = 3;

export interface StoredDeal {
  deal: Deal;
  version: number;
}

export type RepositoryError = TransitionError | { code: "NOT_FOUND" | "CONFLICT"; message: string };
export type ApplyResult = { ok: true; deal: Deal; version: number } | { ok: false; error: RepositoryError };

export interface LedgerContext {
  /** PayPal order / authorization / capture / payout id the event refers to. */
  paypalRef?: string;
  payload?: Record<string, unknown>;
}

interface LedgerEntry extends LedgerContext {
  type: string;
  fromState: DealState;
}

export function createDealRepository(db: Database) {
  async function get(id: string): Promise<StoredDeal | null> {
    const [row] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
    return row ? { deal: rowToDeal(row), version: row.version } : null;
  }

  async function create(deal: Deal): Promise<StoredDeal> {
    await db.transaction(async (tx) => {
      await tx.insert(deals).values({ ...dealToRow(deal), version: 1 });
      await tx.insert(ledgerEvents).values({ dealId: deal.id, type: "DEAL_CREATED", toState: deal.state });
    });
    return { deal, version: 1 };
  }

  /** Writes `deal` only if the stored version is still `expectedVersion`. */
  async function save(deal: Deal, expectedVersion: number, entry: LedgerEntry): Promise<ApplyResult> {
    const nextVersion = expectedVersion + 1;
    const saved = await db.transaction(async (tx) => {
      const updated = await tx
        .update(deals)
        .set({ ...dealToRow(deal), version: nextVersion, updatedAt: sql`now()` })
        .where(and(eq(deals.id, deal.id), eq(deals.version, expectedVersion)))
        .returning({ id: deals.id });
      if (updated.length === 0) return false;

      await tx.insert(ledgerEvents).values({
        dealId: deal.id,
        type: entry.type,
        fromState: entry.fromState,
        toState: deal.state,
        payload: entry.payload ?? {},
        paypalRef: entry.paypalRef,
      });
      return true;
    });

    return saved
      ? { ok: true, deal, version: nextVersion }
      : { ok: false, error: { code: "CONFLICT", message: `Deal ${deal.id} changed since version ${expectedVersion}` } };
  }

  async function applyEvent(id: string, event: DealEvent, context: LedgerContext = {}): Promise<ApplyResult> {
    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
      const stored = await get(id);
      if (!stored) return { ok: false, error: { code: "NOT_FOUND", message: `Deal ${id} does not exist` } };

      const result = transition(stored.deal, event);
      if (!result.ok) return result;

      const saved = await save(result.deal, stored.version, {
        ...context,
        type: event.type,
        fromState: stored.deal.state,
        payload: { ...eventPayload(event), ...context.payload },
      });
      // On a conflict, reload and re-run the pure transition against the newer state.
      if (saved.ok || saved.error.code !== "CONFLICT") return saved;
    }
    return { ok: false, error: { code: "CONFLICT", message: `Deal ${id} kept changing; gave up after retries` } };
  }

  return { get, create, save, applyEvent };
}

export type DealRepository = ReturnType<typeof createDealRepository>;

/** The event's own fields (minus its type) are recorded on the ledger for auditing. */
function eventPayload(event: DealEvent): Record<string, unknown> {
  return Object.fromEntries(Object.entries(event).filter(([key]) => key !== "type"));
}
