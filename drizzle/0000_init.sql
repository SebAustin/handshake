CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"brief" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"mandates" jsonb,
	"terms" jsonb,
	"hold" jsonb,
	"delivery_attempt" smallint DEFAULT 0 NOT NULL,
	"verdict" jsonb,
	"plan" jsonb,
	"contest" jsonb,
	"capture" jsonb,
	"payout" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"attempt" smallint NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"type" text NOT NULL,
	"from_state" text,
	"to_state" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paypal_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "negotiation_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"round" smallint NOT NULL,
	"from_role" text NOT NULL,
	"kind" text NOT NULL,
	"terms" jsonb,
	"rationale" text NOT NULL,
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_state_idx" ON "deals" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_deal_attempt_uq" ON "deliveries" USING btree ("deal_id","attempt");--> statement-breakpoint
CREATE INDEX "ledger_events_deal_idx" ON "ledger_events" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "ledger_events_paypal_ref_idx" ON "ledger_events" USING btree ("paypal_ref");--> statement-breakpoint
CREATE INDEX "negotiation_messages_deal_idx" ON "negotiation_messages" USING btree ("deal_id","round");