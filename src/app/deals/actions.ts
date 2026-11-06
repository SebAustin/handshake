"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deriveCriteria } from "@/briefs/derive-criteria";
import { MAX_DEADLINE_HOURS, roleSchema, type Mandate, type Role } from "@/deals/model";
import { createDeal } from "@/deals/state-machine";
import { getPersona, getServices, PERSONA_COOKIE } from "@/server/context";

/**
 * Server Actions behind the Deal screen. Every input is validated here; every
 * change goes through the Deal state machine via the repository.
 */

export interface ActionState {
  error?: string;
}

const dealIdSchema = z.string().regex(/^d-[a-z0-9]{10}$/);
const dollarsSchema = z.coerce.number().positive().max(100_000);
const hoursSchema = z.coerce.number().int().min(1).max(MAX_DEADLINE_HOURS);

export async function setPersonaAction(role: Role): Promise<void> {
  (await cookies()).set(PERSONA_COOKIE, roleSchema.parse(role), { sameSite: "lax", path: "/" });
  refresh();
}

export async function createDealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const brief = z.string().trim().min(30).max(4000).safeParse(formData.get("brief"));
  if (!brief.success) return { error: "Describe the work in at least 30 characters." };

  const id = `d-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await getServices().deals.create(createDeal({ id, brief: brief.data }));
  (await cookies()).set(PERSONA_COOKIE, "client", { sameSite: "lax", path: "/" });
  redirect(`/deals/${id}`);
}

export async function draftCriteriaAction(dealId: string): Promise<ActionState> {
  const guard = await requireRole(dealId, "client");
  if (guard.error) return guard;
  const { deals } = getServices();
  const stored = await deals.get(dealIdSchema.parse(dealId));
  if (!stored) return { error: "This Deal no longer exists." };

  try {
    const { criteria, suggestedWeights } = await deriveCriteria({ brief: stored.deal.brief });
    return done(await deals.applyEvent(dealId, { type: "CRITERIA_DRAFTED", criteria, suggestedWeights }));
  } catch {
    return { error: "Maya's Agent couldn't draft criteria just now. Try again in a moment." };
  }
}

export async function approveCriteriaAction(dealId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireRole(dealId, "client");
  if (guard.error) return guard;
  const { deals } = getServices();
  const draft = (await deals.get(dealId))?.deal.draft;
  if (!draft) return { error: "There is no draft to approve." };

  const texts = draft.criteria.map((c) => z.string().trim().min(5).max(500).safeParse(formData.get(`criterion-${c.id}`)));
  if (texts.some((t) => !t.success)) return { error: "Each criterion needs at least a few words." };
  const criteria = draft.criteria.map((c, i) => ({ id: c.id, text: texts[i].data ?? c.text }));

  return done(
    await deals.applyEvent(dealId, { type: "CRITERIA_APPROVED", criteria, suggestedWeights: draft.suggestedWeights }),
  );
}

export async function setMandateAction(
  dealId: string,
  role: Role,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await requireRole(dealId, role);
  if (guard.error) return guard;

  const dollars = dollarsSchema.safeParse(formData.get("dollars"));
  const hours = hoursSchema.safeParse(formData.get("hours"));
  if (!dollars.success) return { error: "Enter an amount in dollars." };
  if (!hours.success) return { error: `Enter a deadline between 1 and ${MAX_DEADLINE_HOURS} hours.` };

  const cents = Math.round(dollars.data * 100);
  const mandate: Mandate =
    role === "client"
      ? { role, budgetCeilingCents: cents, maxDeadlineHours: hours.data, minWeights: {} }
      : { role, minPriceCents: cents, minDeadlineHours: hours.data, maxWeights: {} };
  return done(await getServices().deals.applyEvent(dealId, { type: "MANDATE_SET", mandate }));
}

/** Demo identity check: a persona may only act for its own side. */
async function requireRole(dealId: string, role: Role): Promise<ActionState> {
  if (!dealIdSchema.safeParse(dealId).success) return { error: "Unknown Deal." };
  const persona = await getPersona();
  return persona === role ? {} : { error: `Switch to the ${role} to do this.` };
}

function done(result: { ok: true } | { ok: false; error: { message: string } }): ActionState {
  if (!result.ok) return { error: result.error.message };
  refresh();
  return {};
}
