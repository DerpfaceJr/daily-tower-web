# Tips (tips-staging): TEST MODE, NOT RUN, NOT DEPLOYED

- Branch `tips-staging` only. Not merged to main, so not on the live Pages site (Pages syncs from main).
- Stripe **test-mode** Payment Links from the Clowder sandbox (livemode=false). No real money moves.
- Amounts $3 / $5 / $10 are a **price HYPOTHESIS**.
- Visible label next to the buttons: `TEST MODE: no real money`.
- No secret key, webhook, database or analytics. Payment Link URLs are public by design.
- `?tip=thanks` shows a thank-you line only. It is not proof of payment; real totals come only from the Stripe dashboard.
- Based on Director Till's v4 (Path S). PostHog analytics left out (no project yet).

## Checks (all NOT RUN)
- T1 Section shows, with the red TEST MODE label, on index.html. NOT RUN
- T2 Each button opens its test link in a new tab; the run is unchanged. NOT RUN
- T3 Card 4242 4242 4242 4242 completes in test mode and returns to `?tip=thanks`. NOT RUN
- T4 grep for `sk_live|sk_test|rk_|whsec_|phx_|service_role` finds nothing. NOT RUN

## Before live money (owner-only)
1. Activate the live Stripe account (identity, tax, payout bank).
2. Approve switching to live links and setting TEST_MODE=false.
3. Approve privacy.html (NOT LEGAL ADVICE).
