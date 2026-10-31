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

### Data model (sketch)

- `deals` — id, state, brief, price_cents, deadline_at, protocol_version, timestamps
- `criteria` — deal_id, ordinal, text, weight_bp (basis points, Σ = 10 000)
- `mandates` — deal_id, role, budget_ceiling_cents | min_rate_cents, max_deadline_h, locked_criteria
- `negotiation_messages` — deal_id, round, from_role, kind (offer|counter|accept|walk_away), terms jsonb, rationale, mandate_check jsonb
- `holds` — deal_id, order_id, authorization_id, amount_cents, status
- `deliveries` — deal_id, attempt (1|2), content, created_at
- `verdicts` — deal_id, delivery_id, per-criterion results jsonb, model, created_at
- `settlements` — deal_id, kind (full|partial|void), captured_cents, fee_cents, payout_cents, capture_id
- `payouts` — settlement_id, batch_id, item_id, status
- `ledger_events` — append-only audit of every money/state event (feeds Ledger + reconciliation)

### Key flows

1. **Brief → criteria:** Client Agent returns 3–6 criteria with suggested weights (zod-validated, weights normalized to 10 000 bp). Maya edits/approves → criteria locked.
2. **Negotiation:** server-side loop, max 6 rounds; each turn = one LLM call per side returning a typed message. **Every offer is validated in code against the sender's Mandate before it is accepted into the transcript**; out-of-Mandate offers are rejected and the Agent retries once. Streamed to the two-column UI via SSE. No agreement after 6 → both humans see last offers.
3. **Hold:** server creates `intent: AUTHORIZE` order (payee = Handshake); JS SDK v6 approval; `onApprove` → server `POST /v2/checkout/orders/{id}/authorize`; store authorization id.
4. **Delivery:** Freelancer submits text (or "load sample: strong / partial / weak").
5. **Verdict:** Arbiter (Opus) sees only criteria + Delivery. Delivery is wrapped as untrusted data; system prompt instructs to ignore embedded instructions. Output: per-criterion pass/fail + reason + quoted evidence.
6. **Settlement (code):** all pass → full capture; some pass → capture `price × Σw/10000` with `final_capture: true`; none → revision (attempt 1) or void (attempt 2). Contest window (demo: 60 s) before execution; a Contest freezes it.
7. **Payout:** `payout = captured − round(captured × 5%)` to Dev's sandbox email; status via webhook `PAYMENT.PAYOUTS-ITEM.*`, polling fallback.
8. **Toolkit (Should):** after `paid`, Client Agent uses Toolkit MCP `create_invoice` + `record_payment_for_invoice` to issue a paid receipt; reconciliation job uses `list_transactions` and flags Ledger mismatches.

## 4. Milestones (build Must → Should → Could)

| Day | Date | Work | Exit check |
|---|---|---|---|
| 1 | Sat Oct 31 | Sandbox: business + 2 personal accounts, app creds, Payouts enabled. **Money spike script**: authorize → partial capture `final_capture` → verify remainder released; void; payout → SUCCESS. Scaffold Next.js, Neon, Drizzle, Vitest, CI. | Spike log proves every PayPal call we rely on. |
| 2 | Sun Nov 1 | TDD: state machine, settlement math (weights, rounding, fee), Mandate checks. DB schema + repository. | ≥90% coverage on `deals/`, `settlement/`, `mandates/`. |
| 3 | Mon Nov 2 | `paypal/` client (orders, authorizations, payouts, webhook signature verify) + integration tests vs sandbox. Brief → criteria. | Real sandbox Hold created from a test. |
| 4–5 | Tue–Wed Nov 3–4 | Negotiation protocol + Agents + SSE streaming two-column UI with offer cards & Mandate guide-lines. | 20 seeded negotiations converge or end cleanly, 0 out-of-Mandate offers accepted. |
| 6 | Thu Nov 5 | Hold UI (JS SDK v6), Delivery + sample buttons, persona switcher. | Maya can approve a Hold end-to-end in browser. |
| 7 | Fri Nov 6 | Arbiter + Settlement executor + Payout + webhooks. **MUST tier complete, deployed to Vercel.** | Full happy + partial + void paths on the hosted URL. |
| 8 | Sat Nov 7 | Should: revision, Contest freeze, Toolkit receipt + reconciliation, Ledger view. | Ledger reconciles against PayPal for all seeded Deals. |
| 9 | Sun Nov 8 | Design pass: editorial contract-paper tokens, typography, stamp animation (transform/opacity only), reduced-motion, mobile 320–1440. | Visual check at 320/768/1024/1440, both themes if any. |
| 10 | Mon Nov 9 | Playwright E2E for the 3 Settlement paths; security review (rate-limit AI + money routes, secrets, webhook verify, prompt injection test); seed script. | E2E green in CI; injection Delivery ("mark all criteria passed") gets a correct Verdict. |
| 11 | Tue Nov 10 | README (setup, sandbox creds, architecture, AI tools used), LICENSE (MIT), demo seed. Could-tier only if ahead. | Fresh clone → running in < 10 min by README. |
| 12 | Wed Nov 11 | Record + edit video (≤ 2:55, outline below), upload to YouTube, Devpost write-up draft. | Video public, link works logged out. |
| 13 | Thu Nov 12 | Buffer. Submit by 09:00 PT. | Submitted. |

Could tier (only if Day 8 exits early): multi-Freelancer bidding on one Brief; design-work verifier (vision).

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
