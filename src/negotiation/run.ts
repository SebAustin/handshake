import {
  termsSchema,
  type ClientMandate,
  type Criterion,
  type FreelancerMandate,
  type Mandate,
  type Role,
  type Terms,
} from "@/deals/model";
import { checkTerms } from "@/mandates/check";
import {
  MAX_ROUNDS,
  PROTOCOL_VERSION,
  otherRole,
  type AgentMove,
  type NegotiationMessage,
  type NegotiationOutcome,
} from "./protocol";

/**
 * Runs a negotiation between two Agents. The Client's Agent opens every Round.
 * Agents only propose; code checks every Offer and accept against the
 * sender's Mandate, and nothing that fails reaches the other side.
 */

export interface TurnInput {
  role: Role;
  /** The sender's own Mandate. Agents never see the other side's. */
  mandate: Mandate;
  brief: string;
  criteria: readonly Criterion[];
  round: number;
  maxRounds: number;
  /** Accepted messages so far — what both sides can see. */
  transcript: readonly NegotiationMessage[];
  /** The other side's latest valid Offer, if any. */
  standingOffer?: Terms;
  /** Why this Agent's previous attempt this turn was rejected. */
  feedback?: string;
}

export type AgentTurn = (input: TurnInput) => Promise<AgentMove>;

export interface NegotiationInput {
  brief: string;
  criteria: readonly Criterion[];
  mandates: { client: ClientMandate; freelancer: FreelancerMandate };
  turns: Record<Role, AgentTurn>;
  /** Called for every message, valid or not, in order — persist and stream from here. */
  onMessage: (message: NegotiationMessage) => Promise<void>;
  maxRounds?: number;
}

type TurnResult = { kind: "continue" } | { kind: "done"; outcome: NegotiationOutcome };

export async function runNegotiation(input: NegotiationInput): Promise<NegotiationOutcome> {
  const maxRounds = input.maxRounds ?? MAX_ROUNDS;
  const transcript: NegotiationMessage[] = [];
  const standing: Partial<Record<Role, Terms>> = {};

  for (let round = 1; round <= maxRounds; round++) {
    for (const role of ["client", "freelancer"] as const) {
      const result = await playTurn({ input, role, round, maxRounds, transcript, standing });
      if (result.kind === "done") return result.outcome;
    }
  }
  return { kind: "no_deal", reason: `No agreement after ${maxRounds} Rounds`, lastOffers: { ...standing } };
}

interface TurnContext {
  input: NegotiationInput;
  role: Role;
  round: number;
  maxRounds: number;
  transcript: NegotiationMessage[];
  standing: Partial<Record<Role, Terms>>;
}

/** One Agent's turn: one attempt, plus one retry with feedback if code rejects it. */
async function playTurn({ input, role, round, maxRounds, transcript, standing }: TurnContext): Promise<TurnResult> {
  const mandate = input.mandates[role];
  const criterionIds = input.criteria.map((c) => c.id);
  const standingOffer = standing[otherRole(role)];
  let feedback: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const move = await input.turns[role]({
      role,
      mandate,
      brief: input.brief,
      criteria: input.criteria,
      round,
      maxRounds,
      transcript: [...transcript],
      standingOffer,
      feedback,
    });
    const message = checkMove(move, { role, round, mandate, criterionIds, standingOffer });
    await input.onMessage(message);

    if (!message.accepted) {
      feedback = message.violations.map((v) => v.message).join("; ");
      continue;
    }
    transcript.push(message);

    if (message.kind === "offer" && message.terms) {
      standing[role] = message.terms;
      return { kind: "continue" };
    }
    if (message.kind === "accept" && message.terms) {
      return { kind: "done", outcome: { kind: "agreed", terms: message.terms, rounds: round } };
    }
    return {
      kind: "done",
      outcome: { kind: "no_deal", reason: `The ${role}'s Agent walked away`, lastOffers: { ...standing } },
    };
  }
  return {
    kind: "done",
    outcome: {
      kind: "no_deal",
      reason: `The ${role}'s Agent could not produce a valid move within its Mandate`,
      lastOffers: { ...standing },
    },
  };
}

interface CheckContext {
  role: Role;
  round: number;
  mandate: Mandate;
  criterionIds: readonly string[];
  standingOffer?: Terms;
}

function checkMove(move: AgentMove, ctx: CheckContext): NegotiationMessage {
  const base = { protocol: PROTOCOL_VERSION, round: ctx.round, from: ctx.role, kind: move.kind, rationale: move.rationale };

  if (move.kind === "walk_away") return { ...base, violations: [], accepted: true };

  if (move.kind === "accept") {
    if (!ctx.standingOffer) {
      return {
        ...base,
        violations: [{ code: "NOTHING_TO_ACCEPT", message: "There is no Offer from the other side to accept yet" }],
        accepted: false,
      };
    }
    const violations = checkTerms(ctx.standingOffer, ctx.mandate, ctx.criterionIds);
    return { ...base, terms: ctx.standingOffer, violations, accepted: violations.length === 0 };
  }

  const shape = termsSchema.safeParse(move.terms);
  if (!shape.success) {
    const message = shape.error.issues.map((i) => `${i.path.join(".") || "terms"}: ${i.message}`).join("; ");
    return { ...base, terms: move.terms, violations: [{ code: "INVALID_TERMS", message }], accepted: false };
  }
  const violations = checkTerms(move.terms, ctx.mandate, ctx.criterionIds);
  return { ...base, terms: move.terms, violations, accepted: violations.length === 0 };
}
