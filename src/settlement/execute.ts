import type { DealRepository, ApplyResult } from "@/deals/repository";
import type { Deal } from "@/deals/state-machine";
import { PayPalApiError, type PayPalClient } from "@/paypal/client";

/**
 * Executes a Deal's Settlement plan against PayPal (ADR 0001, 0002). Amounts
 * come only from the plan the state machine computed; each PayPal call carries
 * an idempotency key derived from the Deal id, so retrying after a crash is
 * safe. PayPal results are reported back as Deal events.
 */

const PAYOUT_FAILED_ITEM_STATUSES = new Set(["FAILED", "BLOCKED", "RETURNED", "REFUNDED", "REVERSED"]);

export interface SettlementDeps {
  deals: Pick<DealRepository, "get" | "applyEvent">;
  paypal: Pick<PayPalClient, "captureAuthorization" | "voidAuthorization" | "createPayout" | "getPayoutBatch">;
  /** PayPal account that receives the Freelancer's share (the demo Freelancer persona). */
  payoutReceiverEmail: string;
}

export type SettlementError = { code: "NOT_FOUND" | "NOT_SETTLEABLE" | "PAYPAL_ERROR" | "STATE_ERROR"; message: string };
export type SettlementResult = { ok: true; deal: Deal } | { ok: false; error: SettlementError };

/** Captures or voids the Hold, then sends the Payout. Resumable at any step. */
export async function executeSettlement(deps: SettlementDeps, dealId: string): Promise<SettlementResult> {
  const stored = await deps.deals.get(dealId);
  if (!stored) return failure("NOT_FOUND", `Deal ${dealId} does not exist`);
  const { deal } = stored;

  try {
    if (deal.state === "settling") {
      const settled = await settleHold(deps, deal);
      if (!settled.ok || settled.deal.state !== "payout_pending") return settled;
      return await sendPayout(deps, settled.deal);
    }
    if (deal.state === "payout_pending" && !deal.payout) return await sendPayout(deps, deal);
  } catch (error) {
    if (error instanceof PayPalApiError) {
      return failure("PAYPAL_ERROR", `${error.message} [${error.issues.join(", ")}] debug_id=${error.debugId ?? "-"}`);
    }
    throw error;
  }
  return failure("NOT_SETTLEABLE", `Deal ${dealId} is ${deal.state}; nothing to settle`);
}

/** Polls the Payout batch and records success or failure; leaves the Deal alone while PayPal is processing. */
export async function refreshPayout(deps: SettlementDeps, dealId: string): Promise<SettlementResult> {
  const stored = await deps.deals.get(dealId);
  if (!stored) return failure("NOT_FOUND", `Deal ${dealId} does not exist`);
  const { deal } = stored;
  if (deal.state !== "payout_pending" || !deal.payout) {
    return failure("NOT_SETTLEABLE", `Deal ${dealId} has no Payout in flight`);
  }

  const batch = await deps.paypal.getPayoutBatch(deal.payout.batchId);
  const item = batch.items[0];
  if (item?.status === "SUCCESS") {
    return fromApply(await deps.deals.applyEvent(dealId, { type: "PAYOUT_SUCCEEDED" }, { paypalRef: item.itemId }));
  }
  if (batch.status === "DENIED" || (item && PAYOUT_FAILED_ITEM_STATUSES.has(item.status))) {
    const reason = item?.error ?? `Payout ${item?.status ?? batch.status}`;
    return fromApply(
      await deps.deals.applyEvent(dealId, { type: "PAYOUT_FAILED", reason }, { paypalRef: item?.itemId }),
    );
  }
  return { ok: true, deal };
}

async function settleHold(deps: SettlementDeps, deal: Deal): Promise<SettlementResult> {
  const plan = deal.plan;
  const authorizationId = deal.hold?.authorizationId;
  if (!plan || !authorizationId) return failure("STATE_ERROR", `Deal ${deal.id} is settling without a plan or Hold`);

  if (plan.kind === "void") {
    await deps.paypal.voidAuthorization(authorizationId, `${deal.id}-void`);
    return fromApply(await deps.deals.applyEvent(deal.id, { type: "HOLD_VOIDED" }, { paypalRef: authorizationId }));
  }
  if (plan.kind === "revision") return failure("STATE_ERROR", `Deal ${deal.id} awaits a revision, not Settlement`);

  // Full capture omits the amount so PayPal captures exactly what was authorized.
  const capture = await deps.paypal.captureAuthorization(authorizationId, {
    ...(plan.kind === "partial" && { amountCents: plan.captureCents }),
    finalCapture: true,
    requestId: `${deal.id}-capture`,
  });
  return fromApply(
    await deps.deals.applyEvent(
      deal.id,
      { type: "CAPTURED", captureId: capture.captureId, amountCents: capture.amountCents },
      { paypalRef: capture.captureId },
    ),
  );
}

async function sendPayout(deps: SettlementDeps, deal: Deal): Promise<SettlementResult> {
  const plan = deal.plan;
  if (plan?.kind !== "full" && plan?.kind !== "partial") {
    return failure("STATE_ERROR", `Deal ${deal.id} has nothing to pay out`);
  }
  const payout = await deps.paypal.createPayout({
    senderBatchId: `${deal.id}-payout`,
    receiverEmail: deps.payoutReceiverEmail,
    amountCents: plan.payoutCents,
    note: `Handshake Deal ${deal.id}`,
  });
  return fromApply(
    await deps.deals.applyEvent(deal.id, { type: "PAYOUT_SENT", batchId: payout.batchId }, { paypalRef: payout.batchId }),
  );
}

function fromApply(result: ApplyResult): SettlementResult {
  return result.ok ? { ok: true, deal: result.deal } : failure("STATE_ERROR", result.error.message);
}

function failure(code: SettlementError["code"], message: string): SettlementResult {
  return { ok: false, error: { code, message } };
}
