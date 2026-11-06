import type { Role } from "@/deals/model";
import type { Deal, DealState } from "@/deals/state-machine";
import { formatCents } from "@/lib/format";

/** The six steps a Deal moves through, in the words the screen uses. */
export const STAGES = [
  { key: "brief", label: "Brief" },
  { key: "terms", label: "Terms" },
  { key: "hold", label: "Hold" },
  { key: "delivery", label: "Delivery" },
  { key: "verdict", label: "Verdict" },
  { key: "settled", label: "Settled" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

const STAGE_OF_STATE: Record<DealState, StageKey> = {
  brief_drafted: "brief",
  criteria_approved: "terms",
  negotiating: "terms",
  no_deal: "terms",
  agreed: "hold",
  hold_pending: "hold",
  held: "delivery",
  revision_requested: "delivery",
  delivered: "verdict",
  judged: "verdict",
  contested: "verdict",
  settling: "settled",
  voided: "settled",
  payout_pending: "settled",
  paid: "settled",
  payout_failed: "settled",
};

export function stageOf(deal: Deal): (typeof STAGES)[number] {
  const key = STAGE_OF_STATE[deal.state];
  return STAGES.find((stage) => stage.key === key) ?? STAGES[0];
}

/** One sentence under the title: where the Deal is and who moves next, from this viewer's side. */
export function nextStep(deal: Deal, persona: Role): string {
  const mine = persona === "client";
  switch (deal.state) {
    case "brief_drafted":
      if (!deal.draft) return mine ? "Let your Agent turn the Brief into checkable criteria." : "Waiting for Maya's Agent to draft the criteria.";
      return mine ? "Review the criteria your Agent drafted, then approve them." : "Maya is reviewing the drafted criteria.";
    case "criteria_approved": {
      const own = deal.pendingMandates?.[persona];
      const other = deal.pendingMandates?.[mine ? "freelancer" : "client"];
      if (own && other) return "Both limits are set. The Agents are ready to negotiate.";
      if (own) return `Your limits are set. Waiting for ${mine ? "Dev" : "Maya"}.`;
      return "Set your Agent's limits. The other side never sees them.";
    }
    case "negotiating":
      return "The Agents are negotiating inside each side's limits.";
    case "no_deal":
      return "The Agents could not agree inside both sets of limits.";
    case "agreed":
      return deal.terms
        ? `Agreed at ${formatCents(deal.terms.priceCents)} within ${deal.terms.deadlineHours} hours. ${mine ? "Place the Hold to start the work." : "Waiting for Maya to place the Hold."}`
        : "Agreed.";
    case "hold_pending":
      return mine ? "Approve the PayPal authorization to place the Hold." : "Maya is approving the Hold in PayPal.";
    case "held":
      return deal.terms
        ? `${formatCents(deal.terms.priceCents)} is held by PayPal. ${mine ? "Waiting for Dev's Delivery." : `Deliver within ${deal.terms.deadlineHours} hours.`}`
        : "Held.";
    case "revision_requested":
      return mine ? "The Delivery passed nothing. Dev gets one revision." : "Your Delivery passed nothing. You have one revision.";
    case "delivered":
      return "The neutral Arbiter is judging the Delivery.";
    case "judged":
      return "The Verdict is in. Either side can contest before any money moves.";
    case "contested":
      return "The Verdict was contested. Settlement is frozen for a human to review.";
    case "settling":
      return "Settling with PayPal.";
    case "payout_pending":
      return "Captured. PayPal is paying Dev.";
    case "paid":
      return deal.plan && "payoutCents" in deal.plan
        ? `Settled. Dev was paid ${formatCents(deal.plan.payoutCents)} through PayPal.`
        : "Settled.";
    case "payout_failed":
      return "Captured, but PayPal declined the payout to Dev.";
    case "voided":
      return "No criteria passed twice. The Hold was voided; Maya paid nothing.";
    default:
      return `Stage: ${stageOf(deal).label}.`;
  }
}
