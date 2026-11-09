import { z } from "zod";

/**
 * Core Deal vocabulary (see GLOSSARY.md). Schemas double as validators for
 * anything crossing a boundary — LLM output, API input, database rows.
 */

/** Weights are basis points; a Deal's weights always sum to exactly 10 000. */
export const TOTAL_WEIGHT_BP = 10_000;
/** Every capture must land inside the authorization honor period (ADR 0002). */
export const MAX_DEADLINE_HOURS = 72;
export const PLATFORM_FEE_BP = 500;
export const MAX_DELIVERY_ATTEMPTS = 2;

export const roleSchema = z.enum(["client", "freelancer"]);
export type Role = z.infer<typeof roleSchema>;

const cents = z.number().int().positive();
const weightBp = z.number().int().min(0).max(TOTAL_WEIGHT_BP);
const deadlineHours = z.number().int().min(1).max(MAX_DEADLINE_HOURS);

export const criterionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(500),
});
export type Criterion = z.infer<typeof criterionSchema>;

/** Criterion id → weight in basis points. */
export const weightsSchema = z.record(z.string(), weightBp);
export type Weights = z.infer<typeof weightsSchema>;

export const termsSchema = z.object({
  priceCents: cents,
  deadlineHours,
  weights: weightsSchema,
});
export type Terms = z.infer<typeof termsSchema>;

export const clientMandateSchema = z.object({
  role: z.literal("client"),
  budgetCeilingCents: cents,
  maxDeadlineHours: deadlineHours,
  /** Criteria the Client refuses to see weighted below these floors. */
  minWeights: weightsSchema.default({}),
});

export const freelancerMandateSchema = z.object({
  role: z.literal("freelancer"),
  minPriceCents: cents,
  minDeadlineHours: deadlineHours,
  /** Criteria the Freelancer refuses to stake more than these caps on. */
  maxWeights: weightsSchema.default({}),
});

export const mandateSchema = z.discriminatedUnion("role", [clientMandateSchema, freelancerMandateSchema]);
export type ClientMandate = z.infer<typeof clientMandateSchema>;
export type FreelancerMandate = z.infer<typeof freelancerMandateSchema>;
export type Mandate = z.infer<typeof mandateSchema>;

export const deliveryAttemptSchema = z.union([z.literal(1), z.literal(2)]);
export type DeliveryAttempt = z.infer<typeof deliveryAttemptSchema>;

export const criterionResultSchema = z.object({
  criterionId: z.string().min(1),
  passed: z.boolean(),
  reason: z.string().min(1),
  evidence: z.string().default(""),
});
export type CriterionResult = z.infer<typeof criterionResultSchema>;

export const verdictSchema = z.object({
  attempt: deliveryAttemptSchema,
  results: z.array(criterionResultSchema).min(1),
});
export type Verdict = z.infer<typeof verdictSchema>;

/** What code will do with the Hold once the contest window closes (ADR 0001). */
export type SettlementPlan =
  | { kind: "full"; captureCents: number; feeCents: number; payoutCents: number; passedBp: number }
  | { kind: "partial"; captureCents: number; feeCents: number; payoutCents: number; passedBp: number }
  | { kind: "revision"; passedBp: 0 }
  /** `released`: the Client released a contested Hold in full, whatever the Verdict earned. */
  | { kind: "void"; passedBp: number; released?: true };
