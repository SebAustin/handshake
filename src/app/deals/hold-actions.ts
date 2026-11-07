"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { PayPalApiError } from "@/paypal/client";
import { dealTitle } from "@/lib/format";
import { getPersona, getServices } from "@/server/context";
import { getPayPal } from "@/server/paypal";
import { COST, limitMessage, rateLimit } from "@/server/rate-limit";

/**
 * The Hold (ADR 0002): Maya approves a PayPal AUTHORIZE order for exactly the
 * agreed price. Amounts come from the Deal's Terms, never from the browser.
 */

const dealIdSchema = z.string().regex(/^d-[a-z0-9]{10}$/);
const orderIdSchema = z.string().regex(/^[A-Z0-9]{10,30}$/);

export type HoldResult = { ok: true; orderId: string } | { ok: false; error: string };

/** Creates (or reuses) the AUTHORIZE order for this Deal and returns its id to the PayPal SDK. */
export async function createHoldOrderAction(dealId: string): Promise<HoldResult> {
  const check = await requireClient(dealId);
  if (check) return check;
  const { deals } = getServices();
  const deal = (await deals.get(dealId))?.deal;
  if (!deal?.terms) return { ok: false, error: "This Deal has no agreed price yet." };

  if (deal.state === "hold_pending" && deal.hold) return { ok: true, orderId: deal.hold.orderId };
  if (deal.state !== "agreed") return { ok: false, error: "The Hold can only be placed right after agreement." };
  const allowed = await rateLimit("deal", COST.holdOrder);
  if (!allowed.ok) return { ok: false, error: limitMessage(allowed) };

  try {
    const returnUrl = `${await origin()}/deals/${dealId}`;
    const order = await getPayPal().createAuthorizeOrder({
      amountCents: deal.terms.priceCents,
      description: `Handshake: ${dealTitle(deal.brief, 100)}`,
      customId: dealId,
      requestId: `${dealId}-order`,
      returnUrl,
      cancelUrl: returnUrl,
    });
    const applied = await deals.applyEvent(dealId, { type: "HOLD_REQUESTED", orderId: order.id }, { paypalRef: order.id });
    if (!applied.ok) return { ok: false, error: applied.error.message };
    return { ok: true, orderId: order.id };
  } catch (error) {
    return { ok: false, error: describe(error, "PayPal couldn't create the Hold.") };
  }
}

/** After Maya approves in PayPal: authorize the order, which places the Hold. */
export async function authorizeHoldAction(dealId: string, orderId: string): Promise<HoldResult> {
  const check = await requireClient(dealId);
  if (check) return check;
  if (!orderIdSchema.safeParse(orderId).success) return { ok: false, error: "Unknown PayPal order." };
  const { deals } = getServices();
  const deal = (await deals.get(dealId))?.deal;
  if (deal?.state === "held") return { ok: true, orderId };
  if (deal?.state !== "hold_pending" || deal.hold?.orderId !== orderId) {
    return { ok: false, error: "This approval doesn't match the Deal's Hold." };
  }

  try {
    const auth = await getPayPal().authorizeOrder(orderId, `${dealId}-authorize`);
    const applied = await deals.applyEvent(
      dealId,
      { type: "HOLD_PLACED", authorizationId: auth.authorizationId, amountCents: auth.amountCents },
      { paypalRef: auth.authorizationId },
    );
    if (!applied.ok) return { ok: false, error: applied.error.message };
    refresh();
    return { ok: true, orderId };
  } catch (error) {
    return { ok: false, error: describe(error, "PayPal couldn't place the Hold.") };
  }
}

/**
 * Recovery for an approval that never reached the page (popup closed, approved
 * in another browser): ask PayPal for the order and authorize it if approved.
 */
export async function syncHoldAction(dealId: string): Promise<HoldResult & { approveUrl?: string }> {
  const check = await requireClient(dealId);
  if (check) return check;
  const deal = (await getServices().deals.get(dealId))?.deal;
  if (deal?.state !== "hold_pending" || !deal.hold) return { ok: false, error: "There is no open PayPal order." };

  try {
    const order = await getPayPal().getOrder(deal.hold.orderId);
    if (order.status === "APPROVED") return authorizeHoldAction(dealId, order.id);
    return { ok: false, error: "PayPal hasn't received your approval yet.", approveUrl: order.approveUrl };
  } catch (error) {
    return { ok: false, error: describe(error, "Couldn't reach PayPal.") };
  }
}

async function requireClient(dealId: string): Promise<HoldResult | undefined> {
  if (!dealIdSchema.safeParse(dealId).success) return { ok: false, error: "Unknown Deal." };
  return (await getPersona()) === "client" ? undefined : { ok: false, error: "Only Maya can place the Hold." };
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof PayPalApiError) {
    console.error("PayPal error", { status: error.status, name: error.name, debugId: error.debugId, issues: error.issues });
    return `${fallback} (${error.issues[0] ?? error.name})`;
  }
  console.error(fallback, error);
  return fallback;
}
