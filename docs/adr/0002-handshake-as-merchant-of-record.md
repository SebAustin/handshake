# Handshake is the merchant of record; Freelancers are paid via Payouts

The Client's Hold is a PayPal Orders v2 `AUTHORIZE` order payable to Handshake's own account; Settlement captures (fully, or partially with `final_capture: true` to release the remainder) to Handshake, then pays the Freelancer's share minus a 5% platform fee through the Payouts API. We rejected putting the Freelancer as `payee` (Multiparty) because platform fees and third-party payees require PayPal partner onboarding we can't get in the hackathon window, and payee + AUTHORIZE was unconfirmed in sandbox.

## Consequences

- Verified in sandbox (2026-10-31 spike): a partial capture with `final_capture: true` leaves the authorization `CAPTURED` and releases the remainder — a follow-up void is rejected with `PREVIOUSLY_CAPTURED`, so Settlement never needs a separate void after a partial capture.
- Payouts are asynchronous (PENDING → SUCCESS in ~seconds in sandbox), so Settlement has a "payout pending" state, and a "payout failed" state carrying PayPal's reason (e.g. "Payment to self is not allowed") — capture can succeed while the payout fails.
- Deal deadlines are capped at 72 hours so every capture lands inside the authorization's 3-day honor period; reauthorization is out of scope.
- In production this path holds third-party funds; the intended production route is PayPal Multiparty.
