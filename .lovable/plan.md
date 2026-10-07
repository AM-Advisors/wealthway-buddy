# Phase 1 — Commercial + Operating Foundation

The brief asks for an assessment before each phase. This is Phase 1 only; Phases 2–4 get their own plan later.

## Existing capabilities found
- Service catalog, packages/entitlements, client service configurations (versioned), fund services, rate card, SOW/MSA, Sales quotes with below-baseline approval.
- Fund Health and Account Health scoring, investment readiness, fund launch summary.
- Staff Tasks (Team → Tasks) with assignment, history, reporting-line visibility.
- Harmonious Team assignments (Client-level, Fund overrides).
- Approval queues (locked-record edits, self-approval, maker-checker), fund requests / service requests from fund page.
- Regulatory calendar (Form D, Blue Sky), Operations and team dashboards, client dashboard.

## Reusable components
Shared fund workspace (client + Harmonious modes), sidebar/role visibility, task list, approval dialogs, fund health card, quote builder, pricing calculator.

## Missing capabilities
1. Four administration tiers as products: Core (included with SPVs), Fund Administration ($20,000/yr, $5,500/qtr, $2,000/mo), White Glove ($36,000/yr, $10,000/qtr, $3,500/mo), Institutional (from $60,000/yr, request-only, no self-checkout). Annual shown as best value.
2. Tier entitlements (what each tier includes) and versioned tier pricing.
3. Each fund's engagement records its tier, billing cadence, and named Primary Administrator / Relationship Lead.
4. Status ownership on every task/request: Harmonious handling, Your approval required, Information required, Waiting on investor, Waiting on third party, Completed.
5. Fund Manager Command Center (top bar: fund, tier, health, next report date, next capital event, open exceptions; then the six ownership lanes, deadlines, upcoming reports).
6. Unified Operating Calendar (reports, NAV, tax, regulatory, capital events) per fund.
7. Approval Center and Service Request Center for managers (one inbox each, built on existing queues).
8. Internal Operations dashboard by tier/administrator workload.
9. Public pricing page shows the four tiers; quote builder can price them.

## Data model changes (additive only)
- Tier definitions + versioned tier prices + tier entitlements (new tables, seeded with values above).
- Fund engagement: tier, billing cadence, primary administrator, relationship lead (new append-only engagement history table; nothing removed).
- Task/request ownership lane column (nullable, default derived from existing status).
- No changes to existing data; current funds default to Core until set by staff.

## Security / permission impact
- Tier changes and administrator assignment: Sales/Operations staff only, server-checked, audited.
- Managers see only their funds' lanes; internal-only notes never appear client-side.
- Tier never grants or removes access by itself; Institutional cannot be self-purchased.

## Integration impact
SOW/quote lines pull tier prices; invoices unchanged (no automated billing in Phase 1); commissions keep current rules.

## Implementation stages
1. Tiers, prices, entitlements + public pricing page update.
2. Fund engagement tier/assignees in Operations fund Setup.
3. Ownership lanes on tasks/requests.
4. Fund Manager Command Center + Operating Calendar.
5. Approval Center + Service Request Center.
6. Internal Operations dashboard.

## Open questions (assumed defaults in brackets)
- Does the existing SPV raise-tier pricing stay alongside these tiers? [Yes — Core is included with SPV pricing.]
- The SPV calculator's "White glove service" custom option: replace with the White Glove tier? [Yes.]
