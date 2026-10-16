# Self-serve clients, separate service tiers, SaaS option, 25% price increase

## What changes for clients

1. **Less waiting on Harmonious** — clients can do these on their own, and every action is still recorded in Audit History:
   - **Fund setup:** submitting setup (and new Fund/SPV requests) takes effect right away. Before, it went into review.
   - **Template documents:** clients generate Harmonious templates (Operating Agreement, PPM, Subscription Agreement) themselves, review them, and send them for signature.
   - **Investor invites and sends:** clients invite investors and send onboarding or signing requests without staff.
   - **No change:** money movement, filings, identity/AML decisions and below-rate-card pricing still need a second person.

2. **Service is chosen separately from the fund.** The fund price becomes one base platform price for every fund. On top of that, the client picks one of four service levels:

```text
Service level      Support / SLA                       Price
Self Serve         Platform only, help center           Included in base fund price
Core               72h response                         Buy-up
Enhanced           48h response, named contact          Buy-up
White Glove        24h response, proactive management   Buy-up
(Institutional stays custom on quote)
```

3. **New SaaS option.** Platform only, with no Harmonious support. Services can be bought one at a time at the **Core à la carte price plus a fixed markup**. Fund documents are $500 each.

4. **All standard prices go up 25%:** rate card services, plan prices and cap table tiers. Pass-through and government fees (for example Form D $160 and Blue Sky) stay at cost. Prices already agreed with a client, and fund pricing snapshots already taken, stay as they are.

## Shown in
- The public pricing page and Sales quotes show the four service levels, the SaaS option and the new prices.
- Each fund's Setup gets a Service level picker. Requests for support follow the SLA for that level.
- On the client fund page, SaaS clients see an "Add service" button with the à la carte price.

## Needs your confirmation before building
- **SaaS markup %:** what markup over Core à la carte should apply? I'll default to 50% unless you say otherwise. Fund documents are fixed at $500 either way.
- **Name of the middle tier:** "Enhanced" is a placeholder.
- **Buy-up prices:** what do Core, Enhanced and White Glove cost? Until you set them, I'll use today's Fund Administration and White Glove prices raised by 25%.

## Technical details
- `src/lib/administration-tiers.ts`: add `self_serve` and a `saas` delivery model, keep `TierKey` additive, and apply the ×1.25 uplift to `prices`. The `src/lib/cap-table-tiers.ts` uplift is the same.
- New `service_tier` on fund engagements (additive column, default `self_serve`). SLA resolution in `sla-policy.ts` keys on tier, not fund product. Add a `SELF_SERVE` policy (no response target) and a `SAAS` policy (no support).
- Rate card: insert a new published `service_catalog` price version at `standard_price_cents × 1.25`. Rows where `pass_through` is true stay unchanged. Add a SaaS price column, computed as Core × markup, with an override for `fund_documents` = 50000 cents. Old versions stay for history.
- Approvals: client fund-setup submission, `submitFundRequest` and template generate/send paths skip the review queue. Server-side checks still confirm the caller is the fund's manager. Money paths and `capabilitiesFor(..., { moneyPath: true })` are untouched.
- Update memory (pricing) and src/lib/AGENTS.md rule: "service tier is independent of fund product".
- Tests: update `commercial-pricing.test.ts` and `sla-policy.test.ts` for the new tiers, the uplift and the pass-through exemption.
