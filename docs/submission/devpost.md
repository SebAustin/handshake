# Devpost submission: Handshake

Paste each section into the matching Devpost field. Items in [brackets] are for you to fill in.

---

## Name

Handshake

## Tagline (one line)

Two AI agents negotiate a freelance deal, PayPal holds the money, a neutral AI judges the work, and code settles it.

## Links

- Live demo: https://handshake-woad-xi.vercel.app (PayPal sandbox, test money only)
- Code: [GitHub repo URL] (MIT)
- Video: [YouTube URL]

---

## Inspiration

Paying a freelancer you've never met means someone carries the risk. Pay up front and you hope the work arrives. Deliver first and you hope the money does. Escrow solves the trust problem, but adds paperwork, and the real fight is still left open: was the work good enough?

We wanted to see if AI could take the busywork out of a deal without ever being trusted with the money itself.

## What it does

Handshake runs a freelance Deal from Brief to payout:

1. **Brief to criteria.** The Client (Maya) writes the job in plain English. The Client's AI Agent turns it into 3 to 6 checkable criteria, each with a suggested weight.
2. **Mandates.** Each person sets private limits for their Agent: Maya's budget ceiling and deadline, the Freelancer's (Dev's) minimum price, and floors or caps on what each criterion is worth.
3. **Negotiation.** The two Agents trade Offers on price, deadline and criterion weights for up to six Rounds. Code checks every Offer against its sender's Mandate before the other Agent ever sees it.
4. **Hold.** Maya approves a PayPal authorization for the agreed price. The money is held, not captured.
5. **Verdict.** Dev submits the work. A neutral Arbiter, a different model that never sees the price, the Mandates or the negotiation, judges each criterion pass or fail and quotes its evidence from the Delivery.
6. **Settlement.** Code computes the payout as price × the weights that passed. PayPal captures that share and releases the rest back to Maya. Dev is paid through PayPal Payouts, minus a 5% platform fee, and Maya gets a paid PayPal invoice as a receipt.

A 30-second Contest Window lets either side stop Settlement before any money moves. A Ledger lists every PayPal call with PayPal's own reference, and checks that held = captured + released.

## How we built it

- **PayPal Orders v2 with `AUTHORIZE` intent and Payments v2** for the Hold, the full or partial capture (`final_capture: true` releases the rest) and the void.
- **PayPal Payouts** to pay the Freelancer.
- **PayPal JS SDK v6** for the Client's approval of the Hold.
- **PayPal Agent Toolkit**, through PayPal's hosted MCP server, issues the receipt: `create_invoice`, `send_invoice`, `record_payment_for_invoice`, `get_invoice`. It only records a payment that already happened, and it can resume if a step fails partway.
- **Claude Sonnet 5.5** (Vercel AI SDK 7) runs both negotiating Agents and drafts criteria from the Brief.
- **Claude Opus 5.5** is the Arbiter. We use a different model on purpose, so the judge is not the same model that negotiated.
- **Next.js 16** (App Router, Server Actions), React 19, Tailwind CSS 4, TypeScript.
- **Neon Postgres** with Drizzle ORM. Hosted on **Vercel**.
- **Vitest and Playwright**: 148 unit tests, 9 integration tests, a live 5-case Arbiter eval and 2 end-to-end tests.
- Built with **Claude Code** as a pair programmer.

The core design rule is written down as our first decision record: **AI never moves money.** The models produce Offers and Verdicts. A pure state machine and integer-cents math decide every amount, and only plain code calls PayPal's money endpoints.

## Challenges we ran into

- **The Agent Toolkit can't hold money.** Its order tool only captures immediately; it has no authorize, void or payout. So the money path uses the PayPal REST APIs directly, and the Toolkit does what it's good at: invoicing.
- **Prompt injection.** A Delivery is text written by the person who gets paid, so it could try to talk the Arbiter into passing everything. We wrap the Delivery as untrusted data, defuse any tag that tries to close that block early, and drop any quote the Arbiter cites that isn't really in the Delivery. Our eval runs four live attacks (a hidden comment, closing the block, a pre-filled verdict, claimed authority). Each one earns 0 criteria, and honest work still passes.
- **Retries that never pay twice.** Every PayPal call carries an idempotency key derived from the Deal, so a crash and retry can't charge or pay twice. The receipt can also resume: if PayPal created the invoice but a later step failed, the next attempt picks up where it stopped.
- **Partial pay is hard to make fair.** Rounding is always down to the cent, in integer cents, and the Ledger checks its own sums.

## Accomplishments that we're proud of

- A full Deal runs end to end on the PayPal sandbox: authorize, partial capture, release, payout and a paid invoice, all visible in the Ledger with PayPal's own references.
- The money logic contains no model calls at all, and the tests prove the settlement math.
- The Arbiter holds up against the four prompt-injection attacks in our eval.

## What we learned

- Splitting jobs between models and code makes an AI product easier to trust: models are good at negotiating and judging text, and code is good at arithmetic and keeping promises.
- Authorize-then-capture is a natural fit for "pay for what was delivered". A partial capture with `final_capture: true` releases the rest in one call.
- Agent tools work best behind narrow, checked boundaries. Every Offer is validated before the other side sees it.

## What's next for Handshake

- Real accounts and sign-in instead of the two demo personas.
- Milestones: several Holds in one Deal.
- A human appeal step when someone contests a Verdict.
- Moving from the sandbox to live PayPal after a security review.

## Built with

nextjs, react, typescript, tailwindcss, vercel, vercel-ai-sdk, anthropic-claude, claude-sonnet, claude-opus, paypal, paypal-orders-api, paypal-payouts, paypal-js-sdk, paypal-agent-toolkit, mcp, postgresql, neon, drizzle-orm, vitest, playwright, claude-code

---

## Testing notes for judges (private Devpost field)

The demo has no sign-up. Switch between Maya (the Client) and Dev (the Freelancer) at the top left.

To place a Hold, log in to PayPal with this **sandbox** buyer account (test money only):

- Email: [sandbox buyer email]
- Password: [sandbox buyer password]

The quickest path: open a Deal, approve the criteria, set both Mandates, start the negotiation, approve the Hold with the account above, load the *Partial* sample Delivery as Dev and submit it, then click **Settle now** as both people. The Ledger shows every PayPal call.

The public demo is rate-limited per visitor, so if a model call is refused, wait a few minutes and try again.
