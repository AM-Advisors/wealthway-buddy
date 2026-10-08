# WALKTHROUGH-Q1-2026 gap register (DEMO reference fund)

| # | Gap | Type | Severity | Real parallel pilot blocker | Production cutover blocker | Status |
|---|-----|------|----------|-----------------------------|----------------------------|--------|
| G-1 | Capital-call, funding and journal workflows only recognise `admin` as fund staff (onboardingActor isStaff = admin). QA users needed Admin, not just Operations. | Control / authorization design gap | HIGH | YES, unless a narrowly scoped operational role replaces Admin before pilot | YES | Open - not redesigned during payments run; no permission weakened |
| G-2 | No overpayment / unapplied investor credit holding: funding journals book the full bank amount to contributions. Overpayments are now refused (stay unapplied) instead of entering capital. | Accounting / data-model gap | HIGH | YES | YES | Open - Okafor $300,050 deposit held unapplied; build investor-credit liability before Q1 NAV |
| G-3 | A manual/DEMO bank account cannot be recorded: bank_accounts requires a provider item, so DEMO deposits carry no bank account. | Data-model gap | MEDIUM | YES (manual statement banks) | YES | Open |
| G-4 | Late payment is visible only as received date vs due date; no late status/history field. | Product gap | LOW | No | No | Open |
| G-5 | Detection proposes a match for a no-reference deposit on amount alone (medium confidence); a person still decides. | Control observation | LOW | No | Review | Open |
