# Handshake

Two people — a Client and a Freelancer — each delegate to their own AI Agent, which negotiates a Deal, holds the Client's money, judges the Delivery, and settles it, all within limits each person set in advance.

## Parties

**Client**:
The person who wants work done and whose money is placed on Hold.
_Avoid_: Buyer, customer, employer

**Freelancer**:
The person who performs the work and receives the payout on Settlement.
_Avoid_: Seller, contractor, worker, vendor

**Agent**:
The AI acting on behalf of exactly one Client or Freelancer, bounded by that person's Mandate.
_Avoid_: Bot, assistant

**Mandate**:
The limits a person grants their Agent — e.g. budget ceiling, minimum price, deadline, and floors or caps on criterion weights. Anything outside it requires the human.
_Avoid_: Settings, preferences, policy

**Arbiter**:
The neutral AI that issues Verdicts; it belongs to neither party and never sees either Mandate or the negotiation.
_Avoid_: Judge, reviewer, verifier

## Agreement

**Brief**:
The Client's plain-English description of the work, from which their Agent derives the Acceptance Criteria.
_Avoid_: Job post, request, description

**Deal**:
The agreement both Agents reach: scope, price, Acceptance Criteria (with weights), and deadline.
_Avoid_: Contract, job, gig, order

**Offer**:
A complete set of proposed Terms — price, deadline and criterion weights — sent by one Agent during negotiation.
_Avoid_: Bid, proposal, quote

**Round**:
One Offer from each Agent; the Client's Agent opens every Round. A negotiation has at most six.
_Avoid_: Turn, exchange, iteration

**Acceptance Criterion**:
One checkable condition the Delivery must meet, carrying a weight that determines its share of the price.
_Avoid_: Requirement, spec item

## Money

**Hold**:
The Client's payment, authorized but not yet captured, backing a Deal.
_Avoid_: Escrow, deposit, reservation

**Settlement**:
The final disposition of a Hold: full capture with payout, partial capture with payout, or void.
_Avoid_: Release, resolution, payment

**Payout**:
The transfer of the Freelancer's share of a Settlement, net of the Platform Fee.
_Avoid_: Disbursement, transfer, withdrawal

**Platform Fee**:
Handshake's cut of each captured amount.
_Avoid_: Commission, take rate

**Ledger**:
The record of every Deal's Hold, Verdict, Settlement and Payout, reconciled against PayPal.
_Avoid_: History, transactions, log

## Work

**Delivery**:
What the Freelancer submits against a Deal. A Deal may have at most one revised Delivery.
_Avoid_: Submission, deliverable, output

**Verdict**:
The Arbiter’s judgment of a Delivery against each Acceptance Criterion — pass or fail — with reasons and quoted evidence.
_Avoid_: Review, grade, score, decision

**Contest Window**:
The short period after a Verdict during which either person may Contest; Settlement happens only once it closes or both people waive it.
_Avoid_: Grace period, cooling-off

**Contest**:
A person’s objection to a Verdict within the Contest Window; it freezes Settlement until the Client releases the Hold in full (a human review is not built yet).
_Avoid_: Dispute (reserved for PayPal disputes), appeal, complaint
