import type { ApplyResult, LedgerContext, StoredDeal } from "@/deals/repository";
import { transition, type Deal, type DealEvent } from "@/deals/state-machine";

/** In-memory stand-in for DealRepository with the same applyEvent semantics, for unit tests. */
export function createMemoryDeals(initial: Deal[] = []) {
  const store = new Map<string, StoredDeal>(initial.map((deal) => [deal.id, { deal, version: 1 }]));
  const ledger: { dealId: string; type: string; context: LedgerContext }[] = [];

  return {
    ledger,
    async get(id: string): Promise<StoredDeal | null> {
      return store.get(id) ?? null;
    },
    async applyEvent(id: string, event: DealEvent, context: LedgerContext = {}): Promise<ApplyResult> {
      const stored = store.get(id);
      if (!stored) return { ok: false, error: { code: "NOT_FOUND", message: `Deal ${id} does not exist` } };
      const result = transition(stored.deal, event);
      if (!result.ok) return result;
      const next = { deal: result.deal, version: stored.version + 1 };
      store.set(id, next);
      ledger.push({ dealId: id, type: event.type, context });
      return { ok: true, ...next };
    },
  };
}
