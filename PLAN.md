# Handshake — Implementation Plan

> Two AI Agents negotiate a freelance Deal inside their humans' Mandates, PayPal holds the Client's money, a neutral Arbiter judges the Delivery, and code settles it.
> Vocabulary: [GLOSSARY.md](GLOSSARY.md). Decisions: [docs/adr/](docs/adr/).

**Deadline:** Thu Nov 12 2026, 12:00 PT (official rules). Internal submit target: **Nov 12, 09:00 PT**.
**Budget:** solo, ~40–60 h over 12 days.
**Prize targets:** Best Use of Agentic Commerce (and Grand). AG Grid sponsor prize **dropped** — see "Scope decisions".

---

## 1. Scope decisions

| Decision | Outcome |
|---|---|
| AG Studio / AG Grid prize | **Dropped** (go/no-go rule from grilling). Research estimate for an AG Studio dashboard + Claude agent on Studio's Agent Framework is 14–24 h (custom Anthropic → AG-UI adapter, new 3.0 API, trial key), vs. the 8 h time-box. The Ledger is built as our own view instead. |
| Money flow | Handshake is merchant of record: AUTHORIZE → capture (full / partial + `final_capture`) → Payouts, 5% Platform Fee ([ADR 0002](docs/adr/0002-handshake-as-merchant-of-record.md)). |
| Who moves money | Code only, never a model ([ADR 0001](docs/adr/0001-ai-never-moves-money.md)). |
| Verdict granularity | Each Acceptance Criterion is **pass/fail** (binary). A Verdict is *partial* when some pass. Settlement = price × Σ weights of passed criteria. Keeps the math explainable on camera. |
| Deal deadline | ≤ 72 h (inside the authorization honor period). |

## 2. Stack

- **Next.js 16 (App Router) + TypeScript**, Tailwind 4, deployed on **Vercel** (Fluid Compute, Node runtime).
- **Neon Postgres** via Vercel Marketplace, **Drizzle** ORM, **zod** at every boundary.
- **AI SDK 7** via **AI Gateway**: `anthropic/claude-sonnet-5.5` (Agents, Brief→criteria), `anthropic/claude-opus-5.5` (Arbiter). Structured outputs via zod schemas.
- **PayPal**: REST (Orders v2, Payments v2 authorizations, Payouts v1, Webhooks) via a thin typed `fetch` client; **JS SDK v6** for buyer approval; **PayPal Agent Toolkit** through the sandbox **MCP server** (AI SDK MCP client) for receipt + reconciliation.
- Tests: **Vitest** (unit/integration), **Playwright** (E2E), MSW for PayPal/LLM mocks in CI.

## 3. Architecture (feature-organized)

```
src/
  deals/        # Deal aggregate, state machine, repository (Drizzle)
  mandates/     # Mandate schema + "is this offer inside the Mandate?" checks
  negotiation/  # protocol types (handshake.negotiation/v1), round runner
  agents/       # client-agent, freelancer-agent prompts + tool-less turn functions
  briefs/       # Brief → weighted Acceptance Criteria (Client Agent)
  arbiter/      # Verdict generation (isolated context, untrusted Delivery)
  settlement/   # pure: Verdict + Deal → amounts; executor: calls paypal/
  paypal/       # REST client: orders, authorizations, payouts, webhooks verify
  toolkit/      # PayPal Agent Toolkit via MCP: receipt invoice, reconciliation
  ledger/       # read model for the Ledger view
app/
  (personas)/   # persona switcher (Maya = Client, Dev = Freelancer)
  deals/[id]/   # one page per Deal; role-aware panels
  ledger/       # Ledger view
  api/          # route handlers: negotiate (streaming), hold, deliver, judge, settle, webhooks/paypal
```

### Deal state machine

```
brief_drafted → criteria_approved → negotiating ─┬→ agreed → hold_pending → held → delivered → judged
                                                 └→ no_deal                       ↑          │
                                                                   revision_requested ←──────┤ (first fail)
                                                                                             ├→ contested (frozen)
                                                                                             └→ settling → settled → payout_pending → paid
                                                                                                         └→ voided
```

Every transition is a function `(deal, event) → deal | error` (pure, immutable, unit-tested). Side effects (PayPal calls) happen only in the settlement executor after a successful transition, with **idempotency keys** (`PayPal-Request-Id` = `dealId:action`).

### Data model (as built, `src/db/schema.ts`)

- `deals` — the whole Deal aggregate in one row: scalar `state`/`brief`/`delivery_attempt`, jsonb parts (criteria, mandates, terms, hold, verdict, plan, contest, capture, payout), `version` for optimistic concurrency. Rewritten whole on each transition.
- `negotiation_messages` — append-only: round, from_role, kind (offer|counter|accept|walk_away), terms, rationale, code-found Mandate violations, accepted
- `deliveries` — deal_id, attempt (1|2, unique per Deal), content
- `ledger_events` — append-only audit of every state change and PayPal call (from/to state, payload, PayPal reference); feeds the Ledger and reconciliation

### Key flows

1. **Brief → criteria:** Client Agent returns 3–6 criteria with suggested weights (zod-validated, weights normalized to 10 000 bp). Maya edits/approves → criteria locked.
2. **Negotiation:** one streaming request runs the whole loop, max 6 Rounds (Client Agent opens each); each turn = one LLM call returning a typed Offer, persisted as it arrives. **Every offer is validated in code against the sender's Mandate before it is accepted into the transcript**; out-of-Mandate offers are rejected and the Agent retries once. Streamed to the two-column UI via SSE. No agreement after 6 → both humans see last offers.
3. **Hold:** server creates `intent: AUTHORIZE` order (payee = Handshake); JS SDK v6 approval; `onApprove` → server `POST /v2/checkout/orders/{id}/authorize`; store authorization id.
4. **Delivery:** Freelancer submits text (or "load sample: strong / partial / weak").
5. **Verdict:** Arbiter (Opus) sees only criteria + Delivery. Delivery is wrapped as untrusted data; system prompt instructs to ignore embedded instructions. Output: per-criterion pass/fail + reason + quoted evidence.
6. **Settlement (code):** all pass → full capture; some pass → capture `price × Σw/10000` with `final_capture: true`; none → revision (attempt 1) or void (attempt 2). Contest Window (demo: 30 s, "Settle now" waiver) before execution; a Contest freezes it.
7. **Payout:** `payout = captured − round(captured × 5%)` to Dev's sandbox email; status via webhook `PAYMENT.PAYOUTS-ITEM.*`, polling fallback.
8. **Toolkit (Should):** after `paid`, Client Agent uses Toolkit MCP `create_invoice` + `record_payment_for_invoice` to issue a paid receipt. (Reconciliation cut Nov 6.)

## 4. Milestones (re-planned Nov 6)

Days 1–3 done (Oct 31–Nov 1): PayPal client + sandbox spike, state machine, settlement math, Mandate checks, Neon repository, Brief → criteria. ~3.5 days behind the original plan, so scope was re-cut on Nov 6.

| Date | Work |
|---|---|
| Fri Nov 6 | Public GitHub repo + MIT LICENSE, first Vercel deploy. Settlement executor + Payout. Negotiation engine + Arbiter once Claude access is unblocked (Gateway credits). |
| Sat Nov 7 | Deal page UI: Brief → criteria, Mandates, live negotiation stream. |
| Sun Nov 8 | Hold (JS SDK v6, fallback: redirect after 2 h), Delivery, Verdict, Contest Window, Settlement + Payout in the UI. **Must tier on the hosted URL.** |
| Mon Nov 9 | Design pass (contract-paper, stamp), Toolkit invoice-as-receipt, Ledger page. |
| Tue Nov 10 | Rate limits, Delivery prompt-injection test, one Playwright smoke (partial path), README. |
| Wed Nov 11 | Video recording; Devpost text. |
| Thu Nov 12 | Buffer. Submit by 09:00 PT. |

**Decisions (Nov 6):** a whole negotiation runs in one streaming request, persisting each message as it arrives (≤ 12 Agent turns); Contest Window is 30 s in the demo with a "Settle now" waiver; revision and Contest stay (already in the state machine).

**Cut:** `list_transactions` reconciliation (sandbox lag), multi-Freelancer bidding, design verifier, full Playwright suite.

## 5. Testing

- **Unit (TDD):** state machine transitions, settlement amounts (weights, rounding to cent, fee), Mandate validation, negotiation message parsing, weight normalization.
- **Integration:** PayPal client against sandbox (tagged, run manually/nightly); repository against a Neon branch.
- **AI evals (lightweight):** fixed set of Briefs/Deliveries → assert schema validity, Verdict matches expected pass/fail on labeled samples, injection Delivery never flips a fail to pass.
- **E2E (Playwright):** full / partial / void paths with PayPal + LLM mocked via MSW; one smoke run against real sandbox.
- Coverage target 80% overall, higher on money code.

## 6. Risks

| Risk | Mitigation |
|---|---|
| ~~Partial capture + `final_capture` doesn't release remainder in sandbox~~ | **Resolved Oct 31:** remainder released; void afterwards → `PREVIOUSLY_CAPTURED`. |
| ~~Payouts disabled / sandbox balance empty~~ | **Resolved Oct 31:** payout reached SUCCESS. Payout to the app's own business account is DENIED → Settlement needs a `payout_failed` state. |
| Remote PayPal MCP exposes fewer tools | Fall back to calling `@paypal/agent-toolkit` core functions directly (no `ai@4` adapter). |
| Negotiation doesn't converge / looks fake | Code-enforced Mandates, concession heuristic in prompts, seeded Mandates with real overlap for the demo. |
| LLM cost from public demo | Per-IP rate limit on AI routes; cap Deals per persona per hour. |
| Prompt injection via Delivery | Arbiter isolation + eval test; and ADR 0001 means even a wrong Verdict can't exceed the agreed price. |
| Vercel function time | One round per request (well under 300 s). |

## 7. Demo video (≤ 3:00)

0:00 problem → 0:20 Brief → weighted criteria + Mandates → 0:45 live negotiation incl. weights counter → 1:30 Maya approves Hold in PayPal → 1:50 Dev's Delivery misses one criterion, Arbiter partial Verdict → 2:15 partial capture + Payout lands, stamp → 2:35 Ledger reconciled + PayPal receipt → 2:50 close.

## 8. Submission checklist

- [ ] Public GitHub repo, MIT LICENSE visible in About
- [ ] README: problem, features, architecture, **AI tools used and how** (Claude Sonnet/Opus via AI SDK + AI Gateway; PayPal Agent Toolkit via MCP), setup/run, sandbox test credentials
- [ ] Hosted demo URL working logged-out
- [ ] YouTube video public, < 3 min, no third-party music
- [ ] Devpost text description + "built during the hackathon" note
