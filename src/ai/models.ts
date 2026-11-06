import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * Model choices (PLAN.md §2). By default, model strings route through Vercel
 * AI Gateway. When ANTHROPIC_API_KEY is set, Anthropic is called directly
 * instead — same models, no Gateway credits needed. Tests pass a mock model.
 */

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const anthropic = anthropicKey ? createAnthropic({ apiKey: anthropicKey }) : undefined;

/** Client/Freelancer Agents and Brief → criteria. */
export const AGENT_MODEL: LanguageModel = anthropic ? anthropic("claude-sonnet-5-5") : "anthropic/claude-sonnet-5.5";

/** The neutral Arbiter — a different, stronger model than either Agent. */
export const ARBITER_MODEL: LanguageModel = anthropic ? anthropic("claude-opus-5-5") : "anthropic/claude-opus-5.5";
