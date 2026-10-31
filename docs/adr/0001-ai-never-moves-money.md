# AI proposes, code disposes: no model ever moves money

Agents negotiate Deal terms and the Arbiter issues Verdicts, but no model sets an amount or calls a PayPal money-movement endpoint (authorize, capture, void, payout). Settlement amounts are computed deterministically as price × sum of weights of passed Acceptance Criteria, checked against both Mandates, and executed by plain code only on agreed state transitions. We chose this over letting Agents call payment tools directly because a prompt-injected Delivery or a hallucinated amount must never be able to move funds, and because "the AI can't touch the money" is the trust story the product depends on.

## Consequences

- The PayPal Agent Toolkit is used only for non-money-moving actions (invoice-as-receipt after Settlement, transaction reconciliation), not for the Hold/Settlement core — which it also doesn't support (its `create_order` is CAPTURE-only, no authorize/void/payouts as of v1.11.0).
