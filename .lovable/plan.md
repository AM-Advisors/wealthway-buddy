# Six product pricing sheets + separate Administration from Servicing

## What you'll get
Six branded review sheets (PDF), one per product:
1. Cap Table
2. Venture Funds
3. Private Equity Funds
4. Hedge Funds
5. SPVs
6. SaaS Platform

Each sheet uses the same three sections, in this order:

```text
1. Fund cost          Base platform price for the fund / SPV / cap table
2. Fund Administration Accounting work: GL & bank reconciliation, monthly close,
                       NAV, waterfalls, capital accounts, quarterly reporting
3. Servicing          How hands-on Harmonious is, split into:
                        - Client servicing (fund manager): Self Serve / Core / Plus / White Glove
                        - Investor servicing: onboarding help, inquiries, follow-up, statements delivery
4. À la carte         One-off services (fund documents $500 each, etc.)
```

Every price shows its billing type: **monthly, quarterly, yearly or one-time**. No price is listed without one.

## Pricing changes
- **SPV fees go back to the prices before the 25% increase** (one-time fees by capital raised, and SPV service add-ons). Everything else keeps the +25%. Pass-through fees (Form D $160, Blue Sky) stay at cost.
- **Servicing tiers no longer include accounting work.** GL, NAV, waterfalls, quarterly reporting and monthly close move into Fund Administration, priced on their own. Servicing tiers become support/hands-on levels only (response time, named contact, proactive management), with client and investor servicing listed separately.

## Shown in the platform too
So the sheets and the platform match:
- Public pricing page shows the same Fund cost / Administration / Servicing / À la carte layout per product.
- Rate card gets the SPV prices restored, with a billing type on every line.

## Open points (I'll mark these on the sheets for your call)
- Price of Fund Administration vs. each servicing level once separated — I'll split today's tier prices into an Administration price plus a Servicing price that add up to today's total, unless you give numbers.
- Whether Venture / PE / Hedge have different Administration prices (Hedge usually needs monthly NAV). I'll default: Venture and PE quarterly NAV, Hedge monthly NAV at a higher price.
- Cap Table Starter mismatch ($188 vs $161) from the last sheet — I'll use the rate card numbers unless told otherwise.

## Technical details
- New `billing_basis` required (`monthly|quarterly|annual|one_time`) on rate card lines and tier prices; validate in `commercial-pricing` tests.
- New published rate card version: SPV transaction bands and SPV service add-ons at previous (pre-uplift) amounts; old versions kept.
- `src/lib/administration-tiers.ts`: split into `ADMINISTRATION_PACKAGES` (per fund type: venture/pe/hedge) and `SERVICING_TIERS` with `client` and `investor` entitlement lists; move GL/NAV/waterfall/reporting/close entitlements to administration. Update `marketing/administration-tiers.tsx` and pricing page.
- Sheets generated with reportlab from the same source data into `/mnt/documents/pricing/` as `*-pricing-review.pdf`, each visually checked page by page.
- Tests: SPV prices equal pre-uplift amounts; every line has a billing basis; servicing tiers contain no accounting entitlements.
