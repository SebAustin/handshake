# Demo video: Handshake (final cut)

- Length: 2:30, 16:9, 1080p. Narrated with an ElevenLabs voice ("Chris"), with captions.
- Made with Ultrademo: a Playwright capture of the live site, then text-to-speech, then a Remotion render.
- Filmed Deal: https://handshake-woad-xi.vercel.app/deals/d-cf291c6bd0

## How it was filmed

1. **Staged, not filmed.** The Deal was run up to agreed terms on the live site, with real criteria from Maya's Agent and a real negotiation between the two Agents. The Hold was then approved by hand in the PayPal sandbox.
2. **Filmed live.** Dev submits the "Partial" sample, the Arbiter judges it, both people click "Settle now", and PayPal captures, releases, pays out and issues the receipt.

Every number in the narration was read from the live page during capture.

## Narration

| Scene | On screen | Narration |
|---|---|---|
| Intro card | Title card and a home page screenshot | Hi, this is Handshake. Hiring a freelancer you've never met means somebody takes the risk: pay first and hope, or deliver first and hope. In Handshake, two AI agents negotiate the deal, PayPal holds the money, a neutral AI judges the work, and code, never a model, settles it. Let me walk you through one Deal, start to finish. |
| Brief | Home page and Maya's Brief | Maya runs a coffee startup and needs landing page copy. Maya just writes what the job is in plain English. That's the Brief. |
| Criteria | What each criterion is worth | Maya's Agent turns that Brief into criteria you can actually check, like "Punchy headline" and "Free trial call to action", and each one carries a share of the price. |
| Limits | Negotiation chart with Maya's ceiling | Both sides set private limits first. That dashed line is Maya's ceiling, and Dev's minimum price is never shown to Maya at all. |
| Haggle | Negotiation chart | Then the Agents haggle. Maya's opened at $70, Dev's at $120, and they met at $98 in round four. |
| Mandates | Negotiation chart | Here's the part I like: code checks every Offer against its sender's limits before the other side even sees it. |
| Hold | "$98.00 held" | Maya approved the deal in PayPal, and $98 is held on Maya's PayPal. Authorized, not captured. Nobody's been paid yet. |
| Delivery (live) | Switch to Dev, "Partial", "Submit for the Verdict" | Alright, switching to Dev, who submits the finished copy. I'm using the "Partial" sample, so it shouldn't pass everything. |
| Verdict (live) | "3 of 5 criteria passed · 62% of the price earned" | And here's the Arbiter. It's a different model, Claude Opus, and it never sees the price or the negotiation. It judges each criterion pass or fail and quotes the evidence. This one passed 3 of 5, so Dev earned 62% of the price. |
| Settle (live) | "Settle now" as Dev, then as Maya | Either side gets a 30-second window to contest. They're both happy, so Dev clicks "Settle now", then Maya does. |
| Money | Settlement panel | And this is the moment. PayPal captured $60.76, released $37.24 back to Maya, and paid Dev $57.72 through PayPal Payouts after the 5% fee. |
| Receipt | Settlement panel and "View the PayPal invoice" | Maya even gets a paid PayPal invoice as a receipt, issued through the PayPal Agent Toolkit. Every amount here came from code, not from a model. |
| Ledger | Ledger totals and rows | Finally, the Ledger. Every PayPal call is listed with PayPal's own reference, and it checks its own sums: held always equals captured plus released. |
| Outro card | "Handshake", the live URL | So the agents negotiate, the AI judges, and code moves the money through PayPal. Try it yourself at handshake-woad-xi.vercel.app. |

---

## YouTube upload

**Title** (65 characters, under YouTube's 100-character limit)

```
Handshake: AI agents negotiate, PayPal holds the money, code settles
```

**Description**

```
Handshake is our entry for the PayPal AI Hackathon.

Two AI agents negotiate a freelance deal inside limits their humans set. PayPal holds the money, a neutral AI judges the work, and code, never a model, settles it.

In this demo:
0:00 The problem
0:25 The Brief and the checkable criteria
0:42 Private limits, the negotiation and the PayPal Hold
1:15 Live: the Delivery and the Arbiter's Verdict
1:39 Live: Settlement, Payout and the PayPal receipt
2:09 The Ledger

Built with: PayPal Orders v2 (AUTHORIZE), Payments v2, Payouts, JS SDK v6 and the PayPal Agent Toolkit; Claude Sonnet 5.5 and Claude Opus 5.5 through the Vercel AI SDK; Next.js 16, Neon Postgres and Vercel.

Live demo (PayPal sandbox, test money only): https://handshake-woad-xi.vercel.app
Code (MIT): https://github.com/SebAustin/handshake
```

The chapter times were measured from the scene cuts in the render. YouTube wants each chapter to be at least 10 seconds long, so the 8-second Hold scene is folded into the negotiation chapter.

- Visibility: Public or Unlisted. Both are fine for Devpost; Private is not.
- Audience: "No, it's not made for kids".
- Altered or synthetic content: answer **Yes**. The narration is an AI-generated voice.
