ALTER TABLE "deals" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "suggested_weights" jsonb;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "pending_mandates" jsonb;