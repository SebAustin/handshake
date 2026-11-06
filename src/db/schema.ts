import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Deal, DealState } from "@/deals/state-machine";
import type { Role, Terms } from "@/deals/model";
import type { NegotiationMessage } from "@/negotiation/protocol";

/**
 * The Deal aggregate is stored as one row (scalar state + jsonb parts) and
 * rewritten whole on every transition, guarded by `version` for optimistic
 * concurrency. Negotiation messages, Deliveries and the money audit trail are
 * append-only side tables.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    state: text("state").$type<DealState>().notNull(),
    brief: text("brief").notNull(),
    criteria: jsonb("criteria").$type<Deal["criteria"]>().notNull(),
    draft: jsonb("draft").$type<Deal["draft"]>(),
    suggestedWeights: jsonb("suggested_weights").$type<Deal["suggestedWeights"]>(),
    pendingMandates: jsonb("pending_mandates").$type<Deal["pendingMandates"]>(),
    mandates: jsonb("mandates").$type<Deal["mandates"]>(),
    terms: jsonb("terms").$type<Deal["terms"]>(),
    hold: jsonb("hold").$type<Deal["hold"]>(),
    deliveryAttempt: smallint("delivery_attempt").$type<Deal["deliveryAttempt"]>().notNull().default(0),
    verdict: jsonb("verdict").$type<Deal["verdict"]>(),
    verdictAt: text("verdict_at"),
    waivers: jsonb("waivers").$type<Deal["waivers"]>(),
    plan: jsonb("plan").$type<Deal["plan"]>(),
    contest: jsonb("contest").$type<Deal["contest"]>(),
    capture: jsonb("capture").$type<Deal["capture"]>(),
    payout: jsonb("payout").$type<Deal["payout"]>(),
    receipt: jsonb("receipt").$type<Deal["receipt"]>(),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("deals_state_idx").on(table.state)],
);

export const negotiationMessages = pgTable(
  "negotiation_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    round: smallint("round").notNull(),
    fromRole: text("from_role").$type<Role>().notNull(),
    kind: text("kind").$type<NegotiationMessage["kind"]>().notNull(),
    terms: jsonb("terms").$type<Terms>(),
    rationale: text("rationale").notNull(),
    /** Problems found by code; a message with any is never shown to the other Agent. */
    violations: jsonb("violations").$type<NegotiationMessage["violations"]>().notNull().default([]),
    accepted: boolean("accepted").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("negotiation_messages_deal_idx").on(table.dealId, table.round)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    attempt: smallint("attempt").$type<1 | 2>().notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("deliveries_deal_attempt_uq").on(table.dealId, table.attempt)],
);

/** Append-only audit of every state change and PayPal call; feeds the Ledger and reconciliation. */
export const ledgerEvents = pgTable(
  "ledger_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fromState: text("from_state").$type<DealState>(),
    toState: text("to_state").$type<DealState>(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** PayPal order / authorization / capture / payout id this event refers to, if any. */
    paypalRef: text("paypal_ref"),
    createdAt: createdAt(),
  },
  (table) => [index("ledger_events_deal_idx").on(table.dealId), index("ledger_events_paypal_ref_idx").on(table.paypalRef)],
);
