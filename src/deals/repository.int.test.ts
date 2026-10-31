import { afterAll, describe, expect, test } from "vitest";
import { createDatabase } from "@/db/client";
import { deals, ledgerEvents } from "@/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { createDealRepository } from "./repository";
import { createDeal } from "./state-machine";

const { db, close } = createDatabase(process.env.DATABASE_URL ?? "");
const repo = createDealRepository(db);
const created: string[] = [];

function newDealId(): string {
  const id = `test-${crypto.randomUUID()}`;
  created.push(id);
  return id;
}

afterAll(async () => {
  if (created.length) await db.delete(deals).where(inArray(deals.id, created));
  await close();
});

const CRITERIA = [{ id: "headline", text: "Short headline" }];

/** Ledger events after creation (every Deal also gets one DEAL_CREATED entry). */
function eventsAfterCreate(dealId: string) {
  return db
    .select()
    .from(ledgerEvents)
    .where(and(eq(ledgerEvents.dealId, dealId), ne(ledgerEvents.type, "DEAL_CREATED")));
}

describe("DealRepository (Neon)", () => {
  test("creates and reads back a Deal at version 1", async () => {
    const deal = createDeal({ id: newDealId(), brief: "Landing page copy" });

    await repo.create(deal);

    expect(await repo.get(deal.id)).toEqual({ deal, version: 1 });
  });

  test("returns null and NOT_FOUND for unknown Deals", async () => {
    expect(await repo.get("missing")).toBeNull();
    expect(await repo.applyEvent("missing", { type: "NEGOTIATION_FAILED" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  test("applies an event: new state, bumped version, one ledger event", async () => {
    const deal = createDeal({ id: newDealId(), brief: "Blog post" });
    await repo.create(deal);

    const result = await repo.applyEvent(deal.id, { type: "CRITERIA_APPROVED", criteria: CRITERIA }, {
      paypalRef: "REF-1",
    });

    expect(result).toMatchObject({ ok: true, version: 2, deal: { state: "criteria_approved", criteria: CRITERIA } });
    expect(await repo.get(deal.id)).toMatchObject({ version: 2, deal: { state: "criteria_approved" } });
    const events = await eventsAfterCreate(deal.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "CRITERIA_APPROVED",
      fromState: "brief_drafted",
      toState: "criteria_approved",
      paypalRef: "REF-1",
    });
  });

  test("a rejected transition changes nothing and writes no ledger event", async () => {
    const deal = createDeal({ id: newDealId(), brief: "Blog post" });
    await repo.create(deal);

    const result = await repo.applyEvent(deal.id, { type: "PAYOUT_SUCCEEDED" });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await repo.get(deal.id)).toEqual({ deal, version: 1 });
    expect(await eventsAfterCreate(deal.id)).toHaveLength(0);
  });

  test("a save from a stale version is refused", async () => {
    const deal = createDeal({ id: newDealId(), brief: "Blog post" });
    await repo.create(deal);
    await repo.applyEvent(deal.id, { type: "CRITERIA_APPROVED", criteria: CRITERIA });

    const stale = await repo.save(deal, 1, { type: "CRITERIA_APPROVED", fromState: "brief_drafted" });

    expect(stale).toEqual({ ok: false, error: { code: "CONFLICT", message: expect.any(String) } });
    expect(await repo.get(deal.id)).toMatchObject({ version: 2, deal: { state: "criteria_approved" } });
  });

  test("concurrent events on one Deal serialize: exactly one wins", async () => {
    const deal = createDeal({ id: newDealId(), brief: "Blog post" });
    await repo.create(deal);

    const results = await Promise.all([
      repo.applyEvent(deal.id, { type: "CRITERIA_APPROVED", criteria: CRITERIA }),
      repo.applyEvent(deal.id, { type: "CRITERIA_APPROVED", criteria: CRITERIA }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "INVALID_TRANSITION" } });
    expect(await eventsAfterCreate(deal.id)).toHaveLength(1);
  });
});
