# Handshake

**Two AI agents negotiate a freelance deal. PayPal holds the money. A neutral AI judges the work. Code — never a model — settles it.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (Oct–Nov 2026).

> 🚧 Work in progress — the hosted demo, video and full setup guide land before Nov 12.

## How it works

1. **Brief → criteria.** The Client writes a plain-English Brief. Their Agent turns it into 3–6 checkable, weighted Acceptance Criteria.
2. **Mandates.** Each person sets their Agent's limits: the Client's budget and deadline, the Freelancer's minimum price, plus floors and caps on criterion weights.
3. **Negotiation.** The two Agents trade Offers (price, deadline, weights) for up to six Rounds. Code rejects any Offer outside its sender's Mandate.
4. **Hold.** The Client approves a PayPal `AUTHORIZE` order. The money is held, not yet captured.
5. **Verdict.** The Freelancer submits a Delivery. A neutral **Arbiter**, a different model that never sees either Mandate, judges each criterion pass/fail.
6. **Settlement.** Code captures price × the weights that passed. A partial pass uses partial capture with `final_capture`, and the rest is released. The Freelancer is paid through PayPal Payouts, minus a 5% platform fee.

See [GLOSSARY.md](GLOSSARY.md) for the vocabulary, [PLAN.md](PLAN.md) for the build plan, and [docs/adr](docs/adr) for the key decisions.

## PayPal & AI

| | Used for |
|---|---|
| PayPal Orders v2 (`AUTHORIZE`) + Payments v2 | Hold, full/partial capture, void |
| PayPal Payouts | Paying the Freelancer |
| PayPal JS SDK v6 | Client approves the Hold |
| PayPal Agent Toolkit (MCP) | Invoice-as-receipt after Settlement |
| Claude Sonnet 5.5 (via Vercel AI Gateway, AI SDK 7) | Client and Freelancer Agents, Brief → criteria |
| Claude Opus 5.5 | The neutral Arbiter |

## Develop

Requires Node 24+ and pnpm.

```bash
pnpm install
cp .env.example .env.local   # fill in PayPal sandbox + database credentials
pnpm db:migrate
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests (no network) |
| `pnpm test:int` | Integration tests against the database in `.env.local` |
| `pnpm spike:paypal` | Proves the sandbox money flow (authorize, partial capture, void, payout) |
| `pnpm check:criteria` | Runs Brief → criteria against the real model |

## License

[MIT](LICENSE)
