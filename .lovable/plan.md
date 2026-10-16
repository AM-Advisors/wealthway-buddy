# Self-serve sign-up, end to end: buy a Cap Table plan, see only Cap Table

## Goal
A brand-new test client signs up, picks only a Cap Table plan, signs the SOW and MSA, pays with a test card, passes identity (KYC) and business (KYB) checks, and then sees a menu that contains only Cap Table and the always-on basics (Home, Messages, Agreements, Profile/Settings). They can't see Funds, Documents, Tax, Reports, Activity or anything else, and opening those pages directly is blocked.

## What changes
1. **Hide everything not purchased.** Today, anyone on the purchased-services menu still sees every page that isn't specifically tied to a product. That means a Cap Table-only buyer would still see Documents, Tax, Reports, Activity and similar pages. This flips to hide-by-default: every client menu item must be tied to something purchased or be on a short always-allowed list. Fund pages (My Funds, Activity, Reports, Documents, Tax, Distributions, Services) are tied to the fund platform; Cap Table pages to the Cap Table plan.
2. **Block direct links too.** Typing a hidden page's address sends the client back to Home with a "Not part of your plan" message. The server also refuses data for products the client hasn't bought. Hiding a menu item is never the only protection.
3. **Clear status while waiting.** Until access opens, the setup page shows four steps: Signed, Paid, Identity, Business, each marked done or waiting. Once all four are done, the menu opens straight away.
4. **Existing clients are unaffected.** Clients who didn't come through self-serve sign-up keep their full menu, as today.

## End-to-end test run (test environment only, fake data)
1. Create a test client account (fake email) and open Start your plan.
2. Choose 0 funds and Cap Table Starter, then sign the SOW and accept the MSA.
3. Pay with a Stripe test card and confirm the payment shows as received.
4. Identity check: complete it with the verification provider's test mode. If test mode isn't available, a staff member records a test approval, which is marked as test data.
5. Business check: a different staff member approves it in Operations, following the two-person rule.
6. Sign in as the client and check:
   - The menu shows only Home, Cap Table, Messages, Agreements and Profile.
   - Opening My Funds, Documents or Tax directly is blocked.
   - Screenshots are taken as evidence.
7. Repeat once with an unpaid order to confirm the menu stays locked.

The test stays in the project's existing browser tests, so it can be re-run. It refuses to run against production.

## Technical details
- `src/lib/saas-order-model.ts`: when a client is on the purchased-services menu, `requiredEntitlement` becomes deny-by-default. `ALWAYS` stays the allow-list; unknown paths map to `"__unpurchased"`. Add fund-portal prefixes (`/client/activity`, `/client/reports`, `/client/documents`, `/client/tax`, `/client/distributions`, `/client/services`, `/my-funds`) under `fund_platform`. Unit tests: cap-only keys allow `/client/cap-table` and deny `/client/documents`; legacy (null keys) see everything.
- A route guard in the client layout uses `myEntitlementsFn` plus `requiredEntitlement` and redirects to Home. Client data server functions for funds and cap tables check the entitlement on the server.
- `plan.setup` page: four-step status from `mySaasSetupFn`.
- `e2e/saas-cap-table.e2e.ts` uses the existing helpers in `e2e/helpers.ts` (synthetic sessions, refuses production URLs) and Stripe test mode (card 4242 4242 4242 4242). Payment status changes only through the signed webhook.
