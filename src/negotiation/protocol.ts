import { z } from "zod";
import { termsSchema, type Role, type Terms } from "@/deals/model";
import type { Violation } from "@/mandates/check";

/**
 * The negotiation wire format. Versioned so an outside Agent could, in
 * principle, join a Deal by speaking the same messages.
 */

export const PROTOCOL_VERSION = "handshake.negotiation/v1" as const;
export const MAX_ROUNDS = 6;

/** What an Agent returns on its turn. */
export const agentMoveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("offer"), terms: termsSchema, rationale: z.string().min(1).max(400) }),
  z.object({ kind: z.literal("accept"), rationale: z.string().min(1).max(400) }),
  z.object({ kind: z.literal("walk_away"), rationale: z.string().min(1).max(400) }),
]);
export type AgentMove = z.infer<typeof agentMoveSchema>;

/** A move as recorded in the transcript, after code has checked it. */
export interface NegotiationMessage {
  protocol: typeof PROTOCOL_VERSION;
  round: number;
  from: Role;
  kind: AgentMove["kind"];
  /** For an offer, the proposed Terms; for an accept, the Terms being accepted. */
  terms?: Terms;
  rationale: string;
  /** Problems found by code (Mandate breaches, accepting nothing). A message with any never reaches the other Agent. */
  violations: (Violation | { code: "NOTHING_TO_ACCEPT" | "INVALID_TERMS"; message: string })[];
  accepted: boolean;
}

export type NegotiationOutcome =
  | { kind: "agreed"; terms: Terms; rounds: number }
  | { kind: "no_deal"; reason: string; lastOffers: Partial<Record<Role, Terms>> };

export const otherRole = (role: Role): Role => (role === "client" ? "freelancer" : "client");
