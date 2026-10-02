# Cap Table: add, pick a tier, set up auto pay, then build

## What clients will see
1. **Menu:** the Cap Table item and its sub-items show up only when the client has at least one active cap table. An active cap table has a chosen tier, auto pay set up, and setup started.
2. **Add a cap table:** a card on Home and a button in Settings start a short guided flow:
   - **Step 1, Company:** the company's name and legal name.
   - **Step 2, Tier:** cards for Free, Starter, Growth, Scale and Enterprise, each with its price and what's included. A toggle switches between **Monthly** and **Annual** billing. Prices come from the Harmonious rate card. Enterprise shows "Talk to us", which routes the request to Sales instead of checkout.
   - **Step 3, Auto pay:** a secure card checkout sets up the recurring charge. The Free tier skips this step.
   - **Step 4, Set up:** once payment is confirmed, the client lands in the existing cap table setup screens (company details, share classes, importing records).
3. **Billing status** in Settings shows the tier, next charge date and card status. Clients can change tier or cancel; a cancelled cap table stays readable but can't be edited.
4. **Harmonious** sees each client's tier and billing status on the existing admin cap table pages. Operations gets a notice when a new cap table is added.

## Rules
- The cap table unlocks only after the payment provider confirms the card setup. A click in the browser alone never unlocks it.
- A failed payment shows a "payment needs attention" banner. Data is never deleted.
- **This is an exception to the platform's no-automatic-money-movement rule, for cap table subscription fees only.** Filings, taxes, wires, refunds and investor money stay manual. White-label billing can reuse the same setup later, if you want.

## Payments setup
Turn on Lovable's built-in card payments (Stripe), starting in **test mode** so nothing real is charged. Going live requires claiming the payment account. Create one product per tier, each with a monthly and an annual price.

## Technical details
- Run the payment-provider check, enable built-in Stripe payments, and create the tier products and prices using the rate-card amounts. Monthly price = annual price / 12, unless the rate card already has a monthly price.
- New `cap_table_subscriptions` table: client, company, tier, interval, status (`pending_payment`, `active`, `past_due`, `cancelled`), provider IDs, current period end. Add an append-only `cap_table_subscription_events` table. Include grants and row-level security (client members read, staff read). Only server code writes to them.
- Server functions: `startCapTableCheckout` (client admin or staff), `getMyCapTables`, `changeCapTableTier`, `cancelCapTable`. A webhook route under `/api/public/` verifies the provider's signature and only then sets the status.
- Active check: the sidebar hides Cap Table items unless there is a company under the client with an `active` (or free) subscription. Cap table server functions apply the same check, which also closes the open "cap table without an active plan" finding.
- Reuse the existing `cap_onboarding` / `ct_companies` records for step 4; the company record is created when checkout starts.
- Add an AGENTS.md rule for the subscription-billing exception, and update the memory note.
