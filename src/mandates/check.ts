import {
  TOTAL_WEIGHT_BP,
  type ClientMandate,
  type FreelancerMandate,
  type Mandate,
  type Role,
  type Terms,
} from "@/deals/model";

/**
 * Code-enforced Mandates. An Agent may propose anything; an offer only enters
 * the negotiation transcript if these checks pass for the sender, and a Deal
 * only forms if they pass for both sides.
 */

export type ViolationCode =
  | "WEIGHTS_NOT_NORMALIZED"
  | "UNKNOWN_CRITERION"
  | "MISSING_CRITERION"
  | "PRICE_ABOVE_BUDGET"
  | "DEADLINE_TOO_LONG"
  | "WEIGHT_BELOW_FLOOR"
  | "PRICE_BELOW_MINIMUM"
  | "DEADLINE_TOO_SHORT"
  | "WEIGHT_ABOVE_CAP";

export interface Violation {
  code: ViolationCode;
  message: string;
  criterionId?: string;
}

export type GapCode = "BUDGET_BELOW_MINIMUM_PRICE" | "DEADLINE_WINDOW_EMPTY" | "WEIGHT_FLOOR_ABOVE_CAP";

export interface AgreementGap {
  code: GapCode;
  message: string;
  criterionId?: string;
}

export function checkTerms(terms: Terms, mandate: Mandate, criterionIds: readonly string[]): Violation[] {
  const structural = checkStructure(terms, criterionIds);
  const limits = mandate.role === "client" ? checkClientLimits(terms, mandate) : checkFreelancerLimits(terms, mandate);
  return [...structural, ...limits];
}

export function checkTermsAgainstBoth(
  terms: Terms,
  client: ClientMandate,
  freelancer: FreelancerMandate,
  criterionIds: readonly string[],
): (Violation & { role: Role })[] {
  // Structural problems come back with the client side only, so they aren't reported twice.
  return [
    ...checkTerms(terms, client, criterionIds).map((v) => ({ ...v, role: "client" as const })),
    ...checkFreelancerLimits(terms, freelancer).map((v) => ({ ...v, role: "freelancer" as const })),
  ];
}

/** Reasons two Mandates can never produce a Deal, whatever the Agents say. */
export function findAgreementGaps(client: ClientMandate, freelancer: FreelancerMandate): AgreementGap[] {
  const gaps: AgreementGap[] = [];
  if (client.budgetCeilingCents < freelancer.minPriceCents) {
    gaps.push({
      code: "BUDGET_BELOW_MINIMUM_PRICE",
      message: `Budget ${client.budgetCeilingCents}¢ is below the Freelancer's minimum ${freelancer.minPriceCents}¢`,
    });
  }
  if (client.maxDeadlineHours < freelancer.minDeadlineHours) {
    gaps.push({
      code: "DEADLINE_WINDOW_EMPTY",
      message: `Client needs it within ${client.maxDeadlineHours}h; Freelancer needs at least ${freelancer.minDeadlineHours}h`,
    });
  }
  for (const [criterionId, floor] of Object.entries(client.minWeights)) {
    const cap = freelancer.maxWeights[criterionId];
    if (cap !== undefined && floor > cap) {
      gaps.push({
        code: "WEIGHT_FLOOR_ABOVE_CAP",
        message: `Client wants "${criterionId}" weighted ≥ ${floor} bp; Freelancer caps it at ${cap} bp`,
        criterionId,
      });
    }
  }
  return gaps;
}

function checkStructure(terms: Terms, criterionIds: readonly string[]): Violation[] {
  const violations: Violation[] = [];
  const weightIds = Object.keys(terms.weights);
  const total = Object.values(terms.weights).reduce((sum, bp) => sum + bp, 0);

  if (total !== TOTAL_WEIGHT_BP) {
    violations.push({
      code: "WEIGHTS_NOT_NORMALIZED",
      message: `Weights sum to ${total} bp, expected ${TOTAL_WEIGHT_BP}`,
    });
  }
  for (const id of weightIds.filter((id) => !criterionIds.includes(id))) {
    violations.push({ code: "UNKNOWN_CRITERION", message: `"${id}" is not a criterion of this Deal`, criterionId: id });
  }
  for (const id of criterionIds.filter((id) => !weightIds.includes(id))) {
    violations.push({ code: "MISSING_CRITERION", message: `"${id}" has no weight`, criterionId: id });
  }
  return violations;
}

function checkClientLimits(terms: Terms, mandate: ClientMandate): Violation[] {
  const violations: Violation[] = [];
  if (terms.priceCents > mandate.budgetCeilingCents) {
    violations.push({
      code: "PRICE_ABOVE_BUDGET",
      message: `Price ${terms.priceCents}¢ exceeds budget ${mandate.budgetCeilingCents}¢`,
    });
  }
  if (terms.deadlineHours > mandate.maxDeadlineHours) {
    violations.push({
      code: "DEADLINE_TOO_LONG",
      message: `Deadline ${terms.deadlineHours}h exceeds ${mandate.maxDeadlineHours}h`,
    });
  }
  for (const [criterionId, floor] of Object.entries(mandate.minWeights)) {
    const weight = terms.weights[criterionId] ?? 0;
    if (weight < floor) {
      violations.push({
        code: "WEIGHT_BELOW_FLOOR",
        message: `"${criterionId}" weighted ${weight} bp, below the floor of ${floor} bp`,
        criterionId,
      });
    }
  }
  return violations;
}

function checkFreelancerLimits(terms: Terms, mandate: FreelancerMandate): Violation[] {
  const violations: Violation[] = [];
  if (terms.priceCents < mandate.minPriceCents) {
    violations.push({
      code: "PRICE_BELOW_MINIMUM",
      message: `Price ${terms.priceCents}¢ is below the minimum ${mandate.minPriceCents}¢`,
    });
  }
  if (terms.deadlineHours < mandate.minDeadlineHours) {
    violations.push({
      code: "DEADLINE_TOO_SHORT",
      message: `Deadline ${terms.deadlineHours}h is shorter than ${mandate.minDeadlineHours}h`,
    });
  }
  for (const [criterionId, cap] of Object.entries(mandate.maxWeights)) {
    const weight = terms.weights[criterionId] ?? 0;
    if (weight > cap) {
      violations.push({
        code: "WEIGHT_ABOVE_CAP",
        message: `"${criterionId}" weighted ${weight} bp, above the cap of ${cap} bp`,
        criterionId,
      });
    }
  }
  return violations;
}
