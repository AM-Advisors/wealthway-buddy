# WALKTHROUGH-Q1-2026 gap register (DEMO reference fund)

| # | Gap | Type | Severity | Real parallel pilot blocker | Production cutover blocker | Status |
|---|-----|------|----------|-----------------------------|----------------------------|--------|
| G-1 | Capital-call, funding and journal workflows only recognise `admin` as fund staff (onboardingActor isStaff = admin). QA users needed Admin, not just Operations. | Control / authorization design gap | HIGH | YES, unless a narrowly scoped operational role replaces Admin before pilot | YES | Open - not redesigned during payments run; no permission weakened |
| G-2 | No overpayment / unapplied investor credit holding: funding journals book the full bank amount to contributions. Overpayments are now refused (stay unapplied) instead of entering capital. | Accounting / data-model gap | HIGH | YES | YES | RESOLVED - investor_credits + 2500 Investor credits payable; Okafor split $300,000 contribution / $50 credit. Dispositions (refund/apply/void) guarded by creditDispositionError but not yet executable (Q2) |
| G-3 | A manual/DEMO bank account cannot be recorded: bank_accounts requires a provider item, so DEMO deposits carry no bank account. | Data-model gap | MEDIUM | YES (manual statement banks) | YES | Open |
| G-4 | Late payment is visible only as received date vs due date; no late status/history field. | Product gap | LOW | No | No | Open |
| G-5 | Detection proposes a match for a no-reference deposit on amount alone (medium confidence); a person still decides. | Control observation | LOW | No | Review | Open |
| G-6 | No staff/investor screen for investor credits yet (investor receipt data returns the credit balance; no UI). | Product gap | MEDIUM | Yes (staff visibility) | Yes | Open |

## Checkpoint: Q1 investments/expenses/fee (2026-10-08) — BLOCKED, nothing written
- Lumen opening valuation keeps legacy `journal_entry_id` link; Gridwise/Parcel use `recognized_by_journal_id`. Readers accept both (valuation.server.ts). Not rewritten. Lumen 12/31/2025 evidence remains MISSING IN SOURCE (open).
- HIGH: no live investment-purchase workflow (asset + cash outflow + journal + preparer/reviewer). `addAsset` only inserts a holding, no journal, no review, no idempotency.
- HIGH: no live fund-expense workflow posting paid (cash) vs accrued (payable) journals with review; only fund liabilities add/settle.
- HIGH: live fee engine reads `management_fee_terms`; Walkthrough has none, so it yields no fee.
- DATA CONFLICT: live Northwind side letter is 1.50% and status "proposed"; validated Phase 2B used 1.25% executed. Independent Q1 fee on committed capital: $106,062.50 (validated terms), $109,187.50 (live 1.50%), $115,437.50 (side letter not effective). Not changed to hit benchmark.
