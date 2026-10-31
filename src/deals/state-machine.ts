import { checkTermsAgainstBoth, findAgreementGaps } from "@/mandates/check";
import { planSettlement } from "@/settlement/plan";
import type {
  ClientMandate,
  Criterion,
  FreelancerMandate,
  Role,
  SettlementPlan,
  Terms,
  Verdict,
} from "./model";

/**
 * The Deal lifecycle as pure, immutable transitions. Side effects (PayPal,
 * LLM calls) happen elsewhere and report back here as events; a rejected event
 * leaves the Deal untouched.
 */

export type DealState =
  | "brief_drafted"
  | "criteria_approved"
  | "negotiating"
  | "no_deal"
  | "agreed"
  | "hold_pending"
  | "held"
  | "delivered"
  | "judged"
  | "contested"
  | "revision_requested"
  | "settling"
  | "voided"
  | "payout_pending"
  | "paid"
  | "payout_failed";

export interface Deal {
  readonly id: string;
  readonly state: DealState;
  readonly brief: string;
  readonly criteria: readonly Criterion[];
  readonly mandates?: { readonly client: ClientMandate; readonly freelancer: FreelancerMandate };
  readonly terms?: Terms;
  readonly hold?: { readonly orderId: string; readonly authorizationId?: string };
  readonly deliveryAttempt: 0 | 1 | 2;
  readonly verdict?: Verdict;
  readonly plan?: SettlementPlan;
  readonly contest?: { readonly by: Role; readonly reason: string };
  readonly capture?: { readonly captureId: string; readonly amountCents: number };
  readonly payout?: { readonly batchId: string; readonly failureReason?: string };
}

export type DealEvent =
  | { type: "CRITERIA_APPROVED"; criteria: Criterion[] }
  | { type: "NEGOTIATION_STARTED"; client: ClientMandate; freelancer: FreelancerMandate }
  | { type: "AGREEMENT_REACHED"; terms: Terms }
  | { type: "NEGOTIATION_FAILED" }
  | { type: "HOLD_REQUESTED"; orderId: string }
  | { type: "HOLD_PLACED"; authorizationId: string; amountCents: number }
  | { type: "DELIVERY_SUBMITTED" }
  | { type: "VERDICT_ISSUED"; verdict: Verdict }
  | { type: "CONTEST_FILED"; by: Role; reason: string }
  | { type: "CONTEST_WINDOW_CLOSED" }
  | { type: "CAPTURED"; captureId: string; amountCents: number }
  | { type: "HOLD_VOIDED" }
  | { type: "PAYOUT_SENT"; batchId: string }
  | { type: "PAYOUT_SUCCEEDED" }
  | { type: "PAYOUT_FAILED"; reason: string };

export type TransitionError = { code: "INVALID_TRANSITION" | "GUARD_FAILED"; message: string };
export type TransitionResult = { ok: true; deal: Deal } | { ok: false; error: TransitionError };

const ALLOWED_FROM: Record<DealEvent["type"], readonly DealState[]> = {
  CRITERIA_APPROVED: ["brief_drafted"],
  NEGOTIATION_STARTED: ["criteria_approved"],
  AGREEMENT_REACHED: ["negotiating"],
  NEGOTIATION_FAILED: ["negotiating"],
  HOLD_REQUESTED: ["agreed"],
  HOLD_PLACED: ["hold_pending"],
  DELIVERY_SUBMITTED: ["held", "revision_requested"],
  VERDICT_ISSUED: ["delivered"],
  CONTEST_FILED: ["judged"],
  CONTEST_WINDOW_CLOSED: ["judged"],
  CAPTURED: ["settling"],
  HOLD_VOIDED: ["settling"],
  PAYOUT_SENT: ["payout_pending"],
  PAYOUT_SUCCEEDED: ["payout_pending"],
  PAYOUT_FAILED: ["payout_pending"],
};

export function createDeal(input: { id: string; brief: string }): Deal {
  return { id: input.id, brief: input.brief, state: "brief_drafted", criteria: [], deliveryAttempt: 0 };
}

export function transition(deal: Deal, event: DealEvent): TransitionResult {
  if (!ALLOWED_FROM[event.type].includes(deal.state)) {
    return fail("INVALID_TRANSITION", `${event.type} is not allowed in state ${deal.state}`);
  }
  try {
    return { ok: true, deal: apply(deal, event) };
  } catch (error) {
    if (error instanceof GuardError || error instanceof RangeError) return fail("GUARD_FAILED", error.message);
    throw error;
  }
}

class GuardError extends Error {}

function guard(condition: boolean, message: string): asserts condition {
  if (!condition) throw new GuardError(message);
}

function fail(code: TransitionError["code"], message: string): TransitionResult {
  return { ok: false, error: { code, message } };
}

function apply(deal: Deal, event: DealEvent): Deal {
  switch (event.type) {
    case "CRITERIA_APPROVED": {
      const ids = event.criteria.map((c) => c.id);
      guard(ids.length > 0, "A Deal needs at least one Acceptance Criterion");
      guard(new Set(ids).size === ids.length, "Acceptance Criteria ids must be unique");
      return { ...deal, state: "criteria_approved", criteria: event.criteria };
    }
    case "NEGOTIATION_STARTED": {
      const gaps = findAgreementGaps(event.client, event.freelancer);
      guard(gaps.length === 0, `Mandates can never agree: ${gaps.map((g) => g.message).join("; ")}`);
      return { ...deal, state: "negotiating", mandates: { client: event.client, freelancer: event.freelancer } };
    }
    case "AGREEMENT_REACHED": {
      const { client, freelancer } = required(deal.mandates, "mandates");
      const ids = deal.criteria.map((c) => c.id);
      const violations = checkTermsAgainstBoth(event.terms, client, freelancer, ids);
      guard(violations.length === 0, `Terms break a Mandate: ${violations.map((v) => v.message).join("; ")}`);
      return { ...deal, state: "agreed", terms: event.terms };
    }
    case "NEGOTIATION_FAILED":
      return { ...deal, state: "no_deal" };
    case "HOLD_REQUESTED":
      return { ...deal, state: "hold_pending", hold: { orderId: event.orderId } };
    case "HOLD_PLACED": {
      const terms = required(deal.terms, "terms");
      guard(event.amountCents === terms.priceCents, `Hold of ${event.amountCents}¢ ≠ agreed price ${terms.priceCents}¢`);
      const hold = required(deal.hold, "hold");
      return { ...deal, state: "held", hold: { ...hold, authorizationId: event.authorizationId } };
    }
    case "DELIVERY_SUBMITTED":
      return { ...deal, state: "delivered", deliveryAttempt: deal.state === "held" ? 1 : 2 };
    case "VERDICT_ISSUED": {
      guard(
        event.verdict.attempt === deal.deliveryAttempt,
        `Verdict is for attempt ${event.verdict.attempt}, but Delivery is attempt ${deal.deliveryAttempt}`,
      );
      const terms = required(deal.terms, "terms");
      const plan = planSettlement({ priceCents: terms.priceCents, weights: terms.weights, verdict: event.verdict });
      return { ...deal, state: "judged", verdict: event.verdict, plan };
    }
    case "CONTEST_FILED":
      return { ...deal, state: "contested", contest: { by: event.by, reason: event.reason } };
    case "CONTEST_WINDOW_CLOSED": {
      const plan = required(deal.plan, "plan");
      return { ...deal, state: plan.kind === "revision" ? "revision_requested" : "settling" };
    }
    case "CAPTURED": {
      const plan = required(deal.plan, "plan");
      guard(plan.kind === "full" || plan.kind === "partial", `Plan is "${plan.kind}", nothing to capture`);
      guard(
        event.amountCents === plan.captureCents,
        `Captured ${event.amountCents}¢ but the plan says ${plan.captureCents}¢`,
      );
      return {
        ...deal,
        state: "payout_pending",
        capture: { captureId: event.captureId, amountCents: event.amountCents },
      };
    }
    case "HOLD_VOIDED":
      guard(required(deal.plan, "plan").kind === "void", "Only a void plan may void the Hold");
      return { ...deal, state: "voided" };
    case "PAYOUT_SENT":
      return { ...deal, payout: { batchId: event.batchId } };
    case "PAYOUT_SUCCEEDED":
      return { ...deal, state: "paid" };
    case "PAYOUT_FAILED": {
      const payout = required(deal.payout, "payout");
      return { ...deal, state: "payout_failed", payout: { ...payout, failureReason: event.reason } };
    }
  }
}

function required<T>(value: T | undefined, name: string): T {
  guard(value !== undefined, `Deal has no ${name} yet`);
  return value;
}
