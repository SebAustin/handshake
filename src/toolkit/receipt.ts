import type { DealRepository } from "@/deals/repository";
import type { Deal, Receipt } from "@/deals/state-machine";
import { dealTitle, formatCents } from "@/lib/format";
import { centsToValue } from "@/paypal/money";

/**
 * After money is captured, Handshake issues the Client a paid PayPal invoice as
 * a receipt, through the PayPal Agent Toolkit's MCP tools. The invoice only
 * records a payment that already happened (ADR 0001): it never moves money.
 */

/** A PayPal Agent Toolkit tool call: tool name and arguments in, the tool's parsed JSON result out. */
export interface ToolkitClient {
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface ReceiptDeps {
  deals: Pick<DealRepository, "get" | "applyEvent">;
  toolkit: ToolkitClient;
  /** Today's date as yyyy-MM-dd. */
  today: () => string;
}

export type ReceiptResult = { ok: true; deal: Deal } | { ok: false; error: string };

const CURRENCY = "USD";
/** PayPal rejects invoice item names of 200 characters or more. */
const ITEM_NAME_MAX = 120;
const INVOICE_ID = /INV2-[A-Z0-9-]+/;
const RECEIPT_STATES = new Set<Deal["state"]>(["payout_pending", "paid", "payout_failed"]);

/** The `create_invoice` arguments for a Deal's receipt: one line, for exactly what was captured. */
export function receiptInvoiceArgs(deal: Deal, invoiceDate: string): Record<string, unknown> {
  const { capture, terms, verdict } = deal;
  if (!capture || !terms) throw new Error(`Deal ${deal.id} has no capture to receipt`);
  const passed = verdict?.results.filter((r) => r.passed).length ?? 0;
  const total = verdict?.results.length ?? 0;
  const released = terms.priceCents - capture.amountCents;

  return {
    currency_code: CURRENCY,
    invoice_number: `HS-${deal.id}`,
    invoice_date: invoiceDate,
    invoicer_business_name: "Handshake",
    reference: deal.id,
    note:
      `Receipt for Handshake Deal ${deal.id}. The Arbiter found ${passed} of ${total} criteria met, so ` +
      `${formatCents(capture.amountCents)} of the ${formatCents(terms.priceCents)} Hold was captured` +
      (released > 0 ? ` and ${formatCents(released)} was released back to you.` : "."),
    primary_recipients: [{ billing_info: { name: { given_name: "Maya", surname: "(Client)" } } }],
    items: [
      {
        name: truncate(dealTitle(deal.brief), ITEM_NAME_MAX),
        description: `Earned share of the agreed ${formatCents(terms.priceCents)} price`,
        quantity: "1",
        unit_amount: { currency_code: CURRENCY, value: centsToValue(capture.amountCents) },
      },
    ],
  };
}

/** Issues the receipt once per Deal: create the invoice, mark it sent without emailing, record the capture as paid. */
export async function issueReceipt(deps: ReceiptDeps, dealId: string): Promise<ReceiptResult> {
  const deal = (await deps.deals.get(dealId))?.deal;
  if (!deal) return { ok: false, error: `Deal ${dealId} does not exist` };
  if (deal.receipt) return { ok: true, deal };
  if (!deal.capture || !RECEIPT_STATES.has(deal.state)) return { ok: false, error: "Nothing was captured, so there is nothing to receipt." };

  const today = deps.today();
  const created = await deps.toolkit.call("create_invoice", receiptInvoiceArgs(deal, today));
  const invoiceId = findInvoiceId(created);
  if (!invoiceId) return { ok: false, error: "PayPal created the receipt but returned no invoice id." };

  await deps.toolkit.call("send_invoice", { invoice_id: invoiceId, send_to_recipient: false });
  await deps.toolkit.call("record_payment_for_invoice", {
    invoice_id: invoiceId,
    method: "PAYPAL",
    payment_date: today,
    amount: { currency_code: CURRENCY, value: centsToValue(deal.capture.amountCents) },
    note: `PayPal capture ${deal.capture.captureId}`,
  });
  const invoice = readInvoice(await deps.toolkit.call("get_invoice", { invoice_id: invoiceId }));

  const receipt: Receipt = {
    invoiceId,
    invoiceNumber: invoice.number ?? `HS-${deal.id}`,
    status: invoice.status ?? "UNKNOWN",
    ...(invoice.viewUrl && { viewUrl: invoice.viewUrl }),
  };
  const applied = await deps.deals.applyEvent(dealId, { type: "RECEIPT_ISSUED", receipt }, { paypalRef: invoiceId });
  return applied.ok ? { ok: true, deal: applied.deal } : { ok: false, error: applied.error.message };
}

function findInvoiceId(created: unknown): string | undefined {
  const record = asRecord(created);
  const direct = typeof record.id === "string" ? record.id : undefined;
  return direct ?? (typeof record.href === "string" ? INVOICE_ID.exec(record.href)?.[0] : undefined);
}

function readInvoice(raw: unknown): { status?: string; number?: string; viewUrl?: string } {
  const invoice = asRecord(raw);
  const detail = asRecord(invoice.detail);
  const metadata = asRecord(detail.metadata);
  return {
    status: stringOrUndefined(invoice.status),
    number: stringOrUndefined(detail.invoice_number),
    viewUrl: stringOrUndefined(metadata.recipient_view_url),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
