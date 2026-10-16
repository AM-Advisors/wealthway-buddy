# Investor servicing tiers by number of investors

Replace today's investor servicing ("Self Serve investors", "Managed investor support" at $2,500/yr, and $50 per-investor onboarding) with one yearly price per fund, set by how many investors the fund has. Each tier lists exactly what Harmonious does.

## Proposed tiers (yearly, per fund; placeholders for you to confirm)

| Tier | Investors | Price / year | What Harmonious does |
|---|---|---|---|
| Self Serve | Any | Included | Investor portal, automated onboarding and reminders; questions go to the fund manager |
| Essentials | up to 25 | $1,500 | Above, plus investor questions answered by email, chasing missing onboarding items |
| Standard | 26-75 | $3,500 | Above, plus KYC/AML exception follow-up, help delivering statements and tax documents (K-1s) |
| Plus | 76-150 | $6,500 | Above, plus a named investor contact, phone support, help with transfers and contact changes |
| Premier | 151-300 | $11,000 | Above, plus same-day responses, help with capital call and distribution notices, a quarterly investor-activity report to the manager |
| Institutional | 300+ | Custom quote | Dedicated team, custom service levels |

- Quarterly billing = yearly / 4 + 10%, the same rule as everything else. There's no monthly billing.
- If a fund grows past its tier, it moves up at the next renewal. Staff see a "needs upgrade" flag; nothing is charged automatically.
- Per-investor onboarding help ($50 each) stays as an à la carte add-on for funds on Self Serve.
- SaaS keeps its 50% markup on the paid tiers.
- Cap table products don't change.

## Where it shows
- The pricing page and the six product pricing sheets, with the investor servicing table rebuilt as the tiers above.
- The self-serve "Build your plan" picker gets an investor servicing choice. It suggests a tier from the number of investors the client types in.
- The client Services section in Operations gets the new tier options. A current client's investor servicing record stores the tier and the investor count it was priced on.
- The fund's Investors tab shows the fund's tier, its current investor count, and a "needs upgrade" flag when the count is over the tier limit.

## Technical details
- `src/lib/product-pricing.ts`: `INVESTOR_SERVICING` becomes tier lines carrying `maxInvestors`. Add a pure `investorTierFor(count)`.
- `src/lib/saas-order-model.ts`: add `investorServicing` to the order selection, priced on the server. The entitlement keys become `investor_servicing_<tier>`. `src/lib/billing-model.ts`'s catalog picks these keys up.
- Tests cover the tier boundaries (25 / 26, 75 / 76, 150 / 151, 300 / 301), the quarterly price and the SaaS markup.
- Regenerate the pricing review PDFs (v4).
