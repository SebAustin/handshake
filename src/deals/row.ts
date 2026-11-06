import type { deals } from "@/db/schema";
import type { Deal } from "./state-machine";

/** Mapping between the Deal aggregate and its `deals` row. Absent parts are stored as SQL NULL. */

export type DealRow = Omit<typeof deals.$inferInsert, "version" | "createdAt" | "updatedAt">;
type StoredRow = Pick<typeof deals.$inferSelect, keyof DealRow>;

const OPTIONAL_PARTS = ["draft", "suggestedWeights", "pendingMandates", "mandates", "terms", "hold", "verdict", "plan", "contest", "capture", "payout"] as const;

export function dealToRow(deal: Deal): Required<DealRow> {
  return {
    id: deal.id,
    state: deal.state,
    brief: deal.brief,
    criteria: deal.criteria,
    deliveryAttempt: deal.deliveryAttempt,
    draft: deal.draft ?? null,
    suggestedWeights: deal.suggestedWeights ?? null,
    pendingMandates: deal.pendingMandates ?? null,
    mandates: deal.mandates ?? null,
    terms: deal.terms ?? null,
    hold: deal.hold ?? null,
    verdict: deal.verdict ?? null,
    plan: deal.plan ?? null,
    contest: deal.contest ?? null,
    capture: deal.capture ?? null,
    payout: deal.payout ?? null,
  };
}

export function rowToDeal(row: StoredRow): Deal {
  const base: Deal = {
    id: row.id,
    state: row.state,
    brief: row.brief,
    criteria: row.criteria,
    deliveryAttempt: row.deliveryAttempt,
  };
  const present = OPTIONAL_PARTS.filter((part) => row[part] !== null && row[part] !== undefined).map((part) => [
    part,
    row[part],
  ]);
  return { ...base, ...Object.fromEntries(present) };
}
