"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { judgeDelivery } from "@/arbiter/judge";
import type { Role } from "@/deals/model";
import { contestWindow } from "@/settlement/contest-window";
import { executeSettlement, refreshPayout } from "@/settlement/execute";
import { getPersona, getServices } from "@/server/context";
import { getPayPal, getPayoutReceiverEmail } from "@/server/paypal";
import { withPayPalToolkit } from "@/toolkit/mcp";
import { issueReceipt } from "@/toolkit/receipt";

/**
 * Delivery → Verdict → Contest Window → Settlement. The Arbiter judges; the
 * state machine and the settlement plan decide every amount (ADR 0001).
 */

export interface WorkState {
  error?: string;
}

const dealIdSchema = z.string().regex(/^d-[a-z0-9]{10}$/);
const deliverySchema = z.string().trim().min(20, "A Delivery needs at least a few sentences.").max(20_000);
const reasonSchema = z.string().trim().min(5, "Say briefly why you contest the Verdict.").max(500);

export async function submitDeliveryAction(dealId: string, _prev: WorkState, formData: FormData): Promise<WorkState> {
  const persona = await requirePersona(dealId, "freelancer");
  if (typeof persona === "object") return persona;
  const content = deliverySchema.safeParse(formData.get("delivery"));
  if (!content.success) return { error: content.error.issues[0]?.message };

  const { deals, deliveries } = getServices();
  const deal = (await deals.get(dealId))?.deal;
  if (deal?.state !== "held" && deal?.state !== "revision_requested") return { error: "This Deal isn't waiting for a Delivery." };

  const attempt = deal.state === "held" ? 1 : 2;
  await deliveries.save(dealId, attempt, content.data);
  const submitted = await deals.applyEvent(dealId, { type: "DELIVERY_SUBMITTED" }, { payload: { attempt } });
  if (!submitted.ok) return { error: submitted.error.message };

  const judged = await runArbiter(dealId);
  refresh();
  return judged;
}

/** Retry for when the Arbiter failed after a Delivery was submitted. */
export async function judgeAgainAction(dealId: string): Promise<WorkState> {
  if (!dealIdSchema.safeParse(dealId).success) return { error: "Unknown Deal." };
  const result = await runArbiter(dealId);
  refresh();
  return result;
}

export async function waiveContestAction(dealId: string): Promise<WorkState> {
  const role = await requirePersona(dealId);
  if (typeof role === "object") return role;
  const waived = await getServices().deals.applyEvent(dealId, { type: "CONTEST_WAIVED", by: role });
  if (!waived.ok) return { error: waived.error.message };
  return closeContestWindowAction(dealId);
}

export async function contestAction(dealId: string, _prev: WorkState, formData: FormData): Promise<WorkState> {
  const role = await requirePersona(dealId);
  if (typeof role === "object") return role;
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) return { error: reason.error.issues[0]?.message };

  const { deals } = getServices();
  const deal = (await deals.get(dealId))?.deal;
  if (!deal || !contestWindow(deal, new Date()).isOpen) return { error: "The Contest Window has closed." };
  const contested = await deals.applyEvent(dealId, { type: "CONTEST_FILED", by: role, reason: reason.data });
  if (!contested.ok) return { error: contested.error.message };
  refresh();
  return {};
}

/** Closes the window once it has elapsed (or both waived), then settles. Safe to call from both sides. */
export async function closeContestWindowAction(dealId: string): Promise<WorkState> {
  if (!dealIdSchema.safeParse(dealId).success) return { error: "Unknown Deal." };
  const { deals } = getServices();
  const deal = (await deals.get(dealId))?.deal;
  if (deal?.state === "judged") {
    if (contestWindow(deal, new Date()).isOpen) {
      refresh();
      return {};
    }
    await deals.applyEvent(dealId, { type: "CONTEST_WINDOW_CLOSED" });
  }
  return settleAction(dealId);
}

/** Executes (or resumes) Settlement against PayPal. */
export async function settleAction(dealId: string): Promise<WorkState> {
  if (!dealIdSchema.safeParse(dealId).success) return { error: "Unknown Deal." };
  const deal = (await getServices().deals.get(dealId))?.deal;
  if (deal?.state !== "settling" && !(deal?.state === "payout_pending" && !deal.payout)) {
    refresh();
    return {};
  }
  const result = await executeSettlement(settlementDeps(), dealId);
  if (result.ok && result.deal.capture) await receiptFor(dealId);
  refresh();
  return result.ok ? {} : { error: `Settlement didn't finish: ${result.error.message}` };
}

/** Retry for the receipt invoice; Maya's to ask for. */
export async function issueReceiptAction(dealId: string): Promise<WorkState> {
  const persona = await requirePersona(dealId, "client");
  if (typeof persona === "object") return persona;
  const result = await receiptFor(dealId);
  refresh();
  return result;
}

/** Issues the PayPal receipt invoice through the Agent Toolkit. Best-effort: money has already moved. */
async function receiptFor(dealId: string): Promise<WorkState> {
  try {
    const paypal = getPayPal();
    const result = await withPayPalToolkit({ accessToken: await paypal.accessToken() }, (toolkit) =>
      issueReceipt({ deals: getServices().deals, toolkit, today: () => new Date().toISOString().slice(0, 10) }, dealId),
    );
    return result.ok ? {} : { error: result.error };
  } catch (error) {
    console.error(`Receipt failed for ${dealId}`, error);
    return { error: "PayPal couldn't issue the receipt just now. Try again." };
  }
}

export async function refreshPayoutAction(dealId: string): Promise<WorkState> {
  if (!dealIdSchema.safeParse(dealId).success) return { error: "Unknown Deal." };
  const before = (await getServices().deals.get(dealId))?.deal.state;
  const result = await refreshPayout(settlementDeps(), dealId);
  if (result.ok && result.deal.state !== before) refresh();
  return result.ok ? {} : { error: result.error.message };
}

async function runArbiter(dealId: string): Promise<WorkState> {
  const { deals, deliveries } = getServices();
  const deal = (await deals.get(dealId))?.deal;
  if (deal?.state !== "delivered" || deal.deliveryAttempt === 0) return {};
  const content = await deliveries.get(dealId, deal.deliveryAttempt);
  if (!content) return { error: "The Delivery text is missing." };

  try {
    const verdict = await judgeDelivery({ criteria: deal.criteria, delivery: content, attempt: deal.deliveryAttempt });
    const issued = await deals.applyEvent(dealId, { type: "VERDICT_ISSUED", verdict, at: new Date().toISOString() });
    return issued.ok ? {} : { error: issued.error.message };
  } catch (error) {
    console.error(`Arbiter failed for ${dealId}`, error);
    return { error: "The Arbiter couldn't reach a Verdict just now. Ask it again." };
  }
}

function settlementDeps() {
  return { deals: getServices().deals, paypal: getPayPal(), payoutReceiverEmail: getPayoutReceiverEmail() };
}

/** Demo identity check; returns the persona's role, or an error state. */
async function requirePersona(dealId: string, role?: Role): Promise<Role | WorkState> {
  if (!dealIdSchema.safeParse(dealId).success) return { error: "Unknown Deal." };
  const persona = await getPersona();
  if (role && persona !== role) return { error: role === "freelancer" ? "Only Dev can deliver." : "Only Maya can do this." };
  return persona;
}
