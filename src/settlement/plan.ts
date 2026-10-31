import { PLATFORM_FEE_BP, TOTAL_WEIGHT_BP, type SettlementPlan, type Verdict, type Weights } from "@/deals/model";

/**
 * Turns an Arbiter Verdict into money amounts. Pure and deterministic: this is
 * the only place amounts are decided, and no model ever calls it with a number
 * of its own (ADR 0001).
 */

export interface PlanInput {
  priceCents: number;
  weights: Weights;
  verdict: Verdict;
}

/** Platform Fee in cents, rounded half-up. */
export function feeFor(captureCents: number): number {
  return Math.floor((captureCents * PLATFORM_FEE_BP + TOTAL_WEIGHT_BP / 2) / TOTAL_WEIGHT_BP);
}

export function assertWeightsValid(weights: Weights): void {
  const total = Object.values(weights).reduce((sum, bp) => sum + bp, 0);
  if (total !== TOTAL_WEIGHT_BP) {
    throw new RangeError(`Criterion weights must sum to ${TOTAL_WEIGHT_BP} bp, got ${total}`);
  }
}

/** A Verdict must judge every criterion of the Deal exactly once — no gaps, no extras. */
export function assertVerdictCoversWeights(verdict: Verdict, weights: Weights): void {
  const seen = new Set<string>();
  for (const { criterionId } of verdict.results) {
    if (!(criterionId in weights)) throw new RangeError(`Verdict judges unknown criterion "${criterionId}"`);
    if (seen.has(criterionId)) throw new RangeError(`Verdict judges "${criterionId}" more than once`);
    seen.add(criterionId);
  }
  const missing = Object.keys(weights).filter((id) => !seen.has(id));
  if (missing.length > 0) throw new RangeError(`Verdict does not judge: ${missing.join(", ")}`);
}

export function planSettlement({ priceCents, weights, verdict }: PlanInput): SettlementPlan {
  assertWeightsValid(weights);
  assertVerdictCoversWeights(verdict, weights);

  const passedBp = verdict.results
    .filter((result) => result.passed)
    .reduce((sum, result) => sum + weights[result.criterionId], 0);

  if (passedBp === TOTAL_WEIGHT_BP) {
    const feeCents = feeFor(priceCents);
    return { kind: "full", captureCents: priceCents, feeCents, payoutCents: priceCents - feeCents, passedBp };
  }

  if (passedBp === 0) {
    return verdict.attempt === 1 ? { kind: "revision", passedBp: 0 } : { kind: "void", passedBp: 0 };
  }

  // Round down: a partial Settlement never charges the Client more than the passed share.
  const captureCents = Math.floor((priceCents * passedBp) / TOTAL_WEIGHT_BP);
  if (captureCents === 0) return { kind: "void", passedBp };

  const feeCents = feeFor(captureCents);
  return { kind: "partial", captureCents, feeCents, payoutCents: captureCents - feeCents, passedBp };
}
