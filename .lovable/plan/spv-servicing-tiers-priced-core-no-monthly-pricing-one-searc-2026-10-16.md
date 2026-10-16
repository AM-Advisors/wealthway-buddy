# SPV servicing tiers, priced Core, no monthly pricing, one search box

## Pricing changes
1. **SPVs get the full servicing ladder.** Client servicing on SPVs becomes Self Serve (included), Core, Plus, White Glove and Institutional (custom quote). It's the same ladder the funds use.
2. **Core is priced on SPVs.** It is no longer "included in the SPV fee". Proposed prices, scaled down from the fund servicing prices because SPVs are simpler:

```text
SPV servicing      Response / level                      Yearly    Quarterly
Self Serve         Help center                           Included  -
Core               72h response                          $1,500    $413
Plus               48h response, named contact           $2,500    $688
White Glove        24h, proactive management             $7,500    $2,063
Institutional      Dedicated team                        Custom quote
```
   Plus and White Glove use today's SPV add-on prices. Core at $1,500 is a placeholder for you to confirm.
3. **No monthly option anywhere.** Every price is yearly, quarterly or one-time. Cap table plans become yearly only ($1,200 / $3,000 / $5,990), and card checkout stops offering monthly.

The six pricing sheets (as v3), the pricing page and the rate card all get updated.

## One search box
Operations pages currently show two searches: "Find a screen" in the sidebar and "Jump to…" (Ctrl/Cmd+K) in the top bar. They'll become one:
- Keep a single **Jump to** search in the top bar, opened by click or Ctrl/Cmd+K.
- It finds screens, **funds and people** (the fund and people search from "Find a screen" moves into it), for staff only.
- The sidebar "Find a screen" box is removed. Client pages keep the same single Jump to, showing only their own pages.

## Technical details
- `src/lib/product-pricing.ts`: SPV `servicing.client` gets the full ladder with `cadences()` minus monthly. Change `cadences()` to return annual and quarterly only, and drop monthly from `Billing`. Tests assert that no `monthly` billing exists and that SPV Core has a price above 0.
- `src/lib/administration-tiers.ts` and `marketing/administration-tiers.tsx`: drop monthly prices from the displayed cards. `service_pricing_versions.monthly_price` is left as is but no longer shown.
- Cap table: `cap-table-tiers.ts` and the checkout offer the annual interval only. The monthly Stripe prices stay but are not offered. Hide the monthly rate card rows from new quotes (`available_for_new_quotes=false`).
- `quick-jump.tsx`: add a debounced call to `opsQuickSearchFn` (when the user is staff), rendered as Funds and People groups. Remove the search input and results block from `ops-sidebar.tsx`.
