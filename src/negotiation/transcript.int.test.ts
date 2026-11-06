import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { createDatabase } from "@/db/client";
import { deals } from "@/db/schema";
import { createDealRepository } from "@/deals/repository";
import { createDeal } from "@/deals/state-machine";
import { PROTOCOL_VERSION, type NegotiationMessage } from "./protocol";
import { createTranscriptStore } from "./transcript";

const { db, close } = createDatabase(process.env.DATABASE_URL ?? "");
const created: string[] = [];

afterAll(async () => {
  if (created.length) await db.delete(deals).where(inArray(deals.id, created));
  await close();
});

const OFFER: NegotiationMessage = {
  protocol: PROTOCOL_VERSION,
  round: 1,
  from: "client",
  kind: "offer",
  terms: { priceCents: 9000, deadlineHours: 24, weights: { headline: 10000 } },
  rationale: "Opening offer",
  violations: [],
  accepted: true,
};
const REJECTED: NegotiationMessage = {
  ...OFFER,
  from: "freelancer",
  terms: { priceCents: 5000, deadlineHours: 24, weights: { headline: 10000 } },
  violations: [{ code: "PRICE_BELOW_MINIMUM", message: "too low" }],
  accepted: false,
};
const ACCEPT: NegotiationMessage = { ...OFFER, from: "freelancer", kind: "accept", rationale: "Deal" };

describe("TranscriptStore (Neon)", () => {
  test("keeps every message, valid or rejected, in order", async () => {
    const id = `test-${crypto.randomUUID()}`;
    created.push(id);
    await createDealRepository(db).create(createDeal({ id, brief: "Landing page copy" }));
    const transcript = createTranscriptStore(db);

    for (const message of [OFFER, REJECTED, ACCEPT]) await transcript.append(id, message);

    expect(await transcript.list(id)).toEqual([OFFER, REJECTED, ACCEPT]);
  });
});
