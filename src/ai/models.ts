import type { LanguageModel } from "ai";

/**
 * Model choices (PLAN.md §2). Strings route through Vercel AI Gateway; tests
 * and alternative providers pass a LanguageModel instance instead.
 */

/** Client/Freelancer Agents and Brief → criteria. */
export const AGENT_MODEL: LanguageModel = "anthropic/claude-sonnet-5.5";

/** The neutral Arbiter — a different, stronger model than either Agent. */
export const ARBITER_MODEL: LanguageModel = "anthropic/claude-opus-5.5";
