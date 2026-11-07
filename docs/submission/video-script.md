# Demo video script: Handshake (draft, waiting for sign-off)

Target length: about 2:30 (the rule is under 3:00). 16:9, 1080p, narrated, with captions.
Pipeline: Ultrademo (Playwright capture of the live site, then narration, then render).

Recording plan ("stage, then film"):

1. **Before recording (not filmed):** I create a fresh Deal on the live site and run it up to agreed terms: real criteria from Maya's Agent, a real negotiation between the two Agents. You then approve its Hold in PayPal with the sandbox account. I can't type that password.
2. **Filmed:** that Deal, from the Brief to the Ledger. Everything up to the Hold is shown as it really happened. The Delivery, the Verdict, the Settlement and the receipt happen live on camera.

Numbers in [brackets] are filled in from whatever the live run produces. Nothing is invented.

| # | Scene | On screen | Type | ~sec |
|---|---|---|---|---|
| 0 | Intro card | "Handshake", subtitle "Agents shake on it. Code settles it.", over a screenshot of the home page | slide | 12 |
| 1 | The Brief | Home page: hero line and Maya's Brief | still | 9 |
| 2 | Criteria | Deal page: Maya's criteria and what each is worth | still (zoom) | 10 |
| 3 | Mandates | The two Mandate panels, set and private | still | 9 |
| 4 | Negotiation | Convergence chart, then the Round cards | still (zoom on chart) | 15 |
| 5 | Hold | Hold panel: "[$104.00] held" and the authorization ID | still (zoom) | 10 |
| 6 | Delivery | Switch to Dev, load "Partial", "Submit for the Verdict" | clip | 12 |
| 7 | Verdict | Arbiter results land: pass/fail per criterion with quotes | clip, then still | 18 |
| 8 | Settle | Contest Window, "Settle now" as Dev, then as Maya | clip | 12 |
| 9 | Money | Settlement panel: captured, released, fee, Payout, receipt | still (zoom) | 15 |
| 10 | Ledger | Ledger totals with the "Balances" check, then the rows | still | 12 |
| 11 | Outro card | "Handshake", the live URL | slide | 10 |
| | | | **Total** | **~2:25** |

## Narration (Enthusiast voice, first person)

**0. Intro card**
> Hi, this is Handshake. Hiring a freelancer you've never met means somebody takes the risk: pay first and hope, or deliver first and hope. In Handshake, two AI agents negotiate the deal, PayPal holds the money, a neutral AI judges the work, and code, never a model, settles it. Let me walk you through one Deal, start to finish.

**1. The Brief**
> Maya runs a coffee startup and needs landing page copy. Maya just writes what the job is in plain English. That's the Brief.

**2. Criteria**
> Maya's Agent turns that Brief into criteria you can actually check, like "Punchy headline" and "Free trial call to action", and each one carries a share of the price.

**3. Mandates**
> Now both sides set private limits. Maya sets a "Budget ceiling", Dev sets a "Minimum price", and each Agent only ever sees its own.

**4. Negotiation**
> Then the Agents haggle. Maya's opened at [$70], Dev's at [$125], and they met at [$104] in round [four]. Here's the part I like: code checks every Offer against its sender's limits before the other side even sees it. An Agent can't talk its way past a Mandate.

**5. Hold**
> Maya approves the deal in PayPal, and [$104] is held on Maya's PayPal. Authorized, not captured. Nobody's been paid yet.

**6. Delivery**
> Alright, switching to Dev, who submits the finished copy. I'm using the "Partial" sample, so it shouldn't pass everything.

**7. Verdict** (the peak, about two-thirds in)
> And here's the Arbiter. It's a different model, Claude Opus, and it never sees the price or the negotiation. It judges each criterion pass or fail and quotes the evidence. This one passed [4 of 6], so Dev earned [63%] of the price.

**8. Settle**
> Either side gets a 30-second window to contest. They're both happy, so Dev clicks "Settle now", then Maya does.

**9. Money**
> And this is the moment. PayPal captured [$65.52], released [$38.48] back to Maya, and paid Dev [$62.24] through PayPal Payouts after the 5% fee. Maya even gets a paid PayPal invoice as a receipt, issued through the PayPal Agent Toolkit. Every amount here came from code, not from a model.

**10. Ledger**
> Finally, the Ledger. Every PayPal call is listed with PayPal's own reference, and it checks its own sums: held always equals captured plus released.

**11. Outro card**
> So the agents negotiate, the AI judges, and code moves the money through PayPal. Try it yourself at handshake-woad-xi.vercel.app.

## Open questions

1. **Recording plan:** stage the Deal first, then film (recommended), or film the whole thing live, with the AI waits cut out and a pause while you approve the Hold?
2. **Voice:** a natural ElevenLabs voice needs `ELEVENLABS_API_KEY` in the workspace `.env`, which you add yourself. Otherwise I use the free offline voice, which sounds noticeably robotic.
3. **Captions:** "pill" style is recommended, because the Deal pages are dense with text. With ElevenLabs, add the "wipe" word highlight.
4. **Prompt injection:** it's cut from the video to stay under time, and it stays in the Devpost text. Add a 10-second beat showing the "Prompt injection" sample earning 0?
