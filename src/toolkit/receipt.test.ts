import { describe, expect, test, vi } from "vitest";
import type { Verdict } from "@/deals/model";
import { createDeal, transition, type Deal, type DealEvent } from "@/deals/state-machine";
import { createMemoryDeals } from "@/test/memory-deals";
import { issueReceipt, receiptInvoiceArgs, type ToolkitClient } from "./receipt";

const CRITERIA = [
  { id: "headline", text: "Short headline" },
  { id: "tone", text: "Friendly tone" },
];

function verdict(passed: [boolean, boolean]): Verdict {
  return { attempt: 1, results: CRITERIA.map((c, i) => ({ criterionId: c.id, passed: passed[i], reason: "r", evidence: "" })) };
}

function dealIn(passed: [boolean, boolean], extra: DealEvent[] = []): Deal {
  const events: DealEvent[] = [
    { type: "CRITERIA_APPROVED", criteria: CRITERIA },
    {
      type: "NEGOTIATION_STARTED",
      client: { role: "client", budgetCeilingCents: 20000, maxDeadlineHours: 48, minWeights: {} },
      freelancer: { role: "freelancer", minPriceCents: 5000, minDeadlineHours: 12, maxWeights: {} },
    },
    { type: "AGREEMENT_REACHED", terms: { priceCents: 10000, deadlineHours: 24, weights: { headline: 7000, tone: 3000 } } },
    { type: "HOLD_REQUESTED", orderId: "ORDER-1" },
    { type: "HOLD_PLACED", authorizationId: "AUTH-1", amountCents: 10000 },
    { type: "DELIVERY_SUBMITTED" },
    { type: "VERDICT_ISSUED", verdict: verdict(passed) },
    { type: "CONTEST_WINDOW_CLOSED" },
    ...extra,
  ];
  return events.reduce((deal, event) => {
    const result = transition(deal, event);
    if (!result.ok) throw new Error(result.error.message);
    return result.deal;
  }, createDeal({ id: "d-abcdef1234", brief: "Landing page copy for Brewlab" }));
}

const capturedPartial = () => dealIn([true, false], [{ type: "CAPTURED", captureId: "CAP-1", amountCents: 7000 }]);

function fakeToolkit(overrides: Partial<Record<string, unknown>> = {}): ToolkitClient & { call: ReturnType<typeof vi.fn> } {
  const responses: Record<string, unknown> = {
    search_invoicing: { items: [] },
    create_invoice: { rel: "self", href: "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-AAAA-BBBB", method: "GET" },
    send_invoice: { rel: "payer-view", href: "https://www.sandbox.paypal.com/invoice/p/#INV2-AAAA-BBBB" },
    record_payment_for_invoice: { payment_id: "EXTR-1" },
    get_invoice: {
      id: "INV2-AAAA-BBBB",
      status: "MARKED_AS_PAID",
      detail: { invoice_number: "HS-d-abcdef1234", metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#X" } },
    },
    ...overrides,
  };
  return { call: vi.fn(async (name: string) => responses[name]) };
}

describe("receiptInvoiceArgs", () => {
  test("bills Maya exactly the captured amount, numbered after the Deal", () => {
    const args = receiptInvoiceArgs(capturedPartial(), "2026-11-09");
    expect(args).toMatchObject({
      currency_code: "USD",
      invoice_number: "HS-d-abcdef1234",
      invoice_date: "2026-11-09",
      invoicer_business_name: "Handshake",
      items: [{ quantity: "1", unit_amount: { currency_code: "USD", value: "70.00" } }],
    });
  });

  test("says how much of the Hold was earned and released", () => {
    const { note } = receiptInvoiceArgs(capturedPartial(), "2026-11-09");
    expect(note).toContain("1 of 2 criteria");
    expect(note).toContain("$30.00");
  });

  test("keeps the item name under PayPal's 200-character limit for a long Brief", () => {
    const long = { ...capturedPartial(), brief: "I need landing page copy ".repeat(30) };
    const [item] = receiptInvoiceArgs(long, "2026-11-09").items as { name: string }[];
    expect(item.name.length).toBeLessThan(200);
  });

  test("addresses the receipt to the payer's email when known", () => {
    const args = receiptInvoiceArgs(capturedPartial(), "2026-11-09", "maya@personal.example.com");
    expect(args.primary_recipients).toEqual([
      { billing_info: { name: { given_name: "Maya", surname: "(Client)" }, email_address: "maya@personal.example.com" } },
    ]);
  });

  test("refuses a Deal with no capture", () => {
    expect(() => receiptInvoiceArgs(dealIn([true, true]), "2026-11-09")).toThrow(/no capture/i);
  });
});

describe("issueReceipt", () => {
  test("creates, sends quietly, records the PayPal capture and saves the receipt", async () => {
    const deals = createMemoryDeals([capturedPartial()]);
    const toolkit = fakeToolkit();

    const result = await issueReceipt({ deals, toolkit, today: () => "2026-11-09" }, "d-abcdef1234");

    expect(result.ok).toBe(true);
    expect(toolkit.call.mock.calls.map(([name]) => name)).toEqual([
      "search_invoicing",
      "create_invoice",
      "send_invoice",
      "record_payment_for_invoice",
      "get_invoice",
    ]);
    expect(toolkit.call).toHaveBeenCalledWith("send_invoice", { invoice_id: "INV2-AAAA-BBBB", send_to_recipient: false });
    expect(toolkit.call).toHaveBeenCalledWith(
      "record_payment_for_invoice",
      expect.objectContaining({ invoice_id: "INV2-AAAA-BBBB", amount: { currency_code: "USD", value: "70.00" } }),
    );
    const saved = (await deals.get("d-abcdef1234"))?.deal;
    expect(saved?.receipt).toEqual({
      invoiceId: "INV2-AAAA-BBBB",
      invoiceNumber: "HS-d-abcdef1234",
      status: "MARKED_AS_PAID",
      viewUrl: "https://www.sandbox.paypal.com/invoice/p/#X",
    });
    expect(saved?.state).toBe("payout_pending");
  });

  test("looks the receipt up by its invoice number before creating one", async () => {
    const toolkit = fakeToolkit();
    await issueReceipt({ deals: createMemoryDeals([capturedPartial()]), toolkit, today: () => "2026-11-09" }, "d-abcdef1234");
    expect(toolkit.call).toHaveBeenNthCalledWith(1, "search_invoicing", {
      resource_type: "invoice",
      invoice_filters: { invoice_number: "HS-d-abcdef1234" },
    });
  });

  test.each([
    [
      "DRAFT",
      ["search_invoicing", "delete_invoice", "create_invoice", "send_invoice", "record_payment_for_invoice", "get_invoice"],
    ],
    ["SENT", ["search_invoicing", "record_payment_for_invoice", "get_invoice"]],
    ["MARKED_AS_PAID", ["search_invoicing", "get_invoice"]],
  ])("resumes an earlier attempt that left the invoice %s", async (status, calls) => {
    const toolkit = fakeToolkit({ search_invoicing: {
        items: [
          { id: "INV2-OTHER", status: "PAID", detail: { invoice_number: "HS-d-zzzzzzzzzz" } },
          { id: "INV2-AAAA-BBBB", status, detail: { invoice_number: "HS-d-abcdef1234" } },
        ],
      } });
    const deals = createMemoryDeals([capturedPartial()]);

    const result = await issueReceipt({ deals, toolkit, today: () => "2026-11-09" }, "d-abcdef1234");

    expect(result.ok).toBe(true);
    expect(toolkit.call.mock.calls.map(([name]) => name)).toEqual(calls);
    expect((await deals.get("d-abcdef1234"))?.deal.receipt?.invoiceId).toBe("INV2-AAAA-BBBB");
  });

  test("does nothing twice", async () => {
    const issued = transition(capturedPartial(), {
      type: "RECEIPT_ISSUED",
      receipt: { invoiceId: "INV2-OLD", invoiceNumber: "HS-d-abcdef1234", status: "MARKED_AS_PAID" },
    });
    if (!issued.ok) throw new Error(issued.error.message);
    const toolkit = fakeToolkit();

    const result = await issueReceipt({ deals: createMemoryDeals([issued.deal]), toolkit, today: () => "2026-11-09" }, "d-abcdef1234");

    expect(result).toEqual({ ok: true, deal: issued.deal });
    expect(toolkit.call).not.toHaveBeenCalled();
  });

  test("skips a voided Deal: nothing was paid", async () => {
    const voided = dealIn([false, false], []);
    const toolkit = fakeToolkit();
    const result = await issueReceipt({ deals: createMemoryDeals([voided]), toolkit, today: () => "2026-11-09" }, voided.id);
    expect(result.ok).toBe(false);
    expect(toolkit.call).not.toHaveBeenCalled();
  });

  test("reports a create response it cannot read", async () => {
    const toolkit = fakeToolkit({ create_invoice: { rel: "self" } });
    const result = await issueReceipt(
      { deals: createMemoryDeals([capturedPartial()]), toolkit, today: () => "2026-11-09" },
      "d-abcdef1234",
    );
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/invoice id/i) });
  });
});
