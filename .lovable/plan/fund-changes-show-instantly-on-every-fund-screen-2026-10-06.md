# Fund changes show instantly on every fund screen

## Why it lags today
The fund pages each keep their own saved copy of the fund. These are Fund Setup, the Fund Details and Banking tabs, the Operations fund page and the Funds & SPVs list. When you save in one place, only that one copy is refreshed. The others keep showing the old value until you reload.

- Fund Setup details (state of formation, entity type, target raise) refresh only Fund Setup.
- Wire instructions refresh only the wire instructions screen and an older fund page.
- The Fund Setup bank step refreshes only its own step.

## What changes
- **Every save refreshes the whole fund:** saving any fund fact refreshes all fund screens for that fund straight away. That covers the fund details, entity type, state of formation, target raise, wire instructions, the bank step, legal name, fees and team. Every place that shows the value then has the new one.
- **Same source for Fund Details:** the Fund Details tab already reads the fund's main details. Fund Setup now saves to those same details, as of the last change. So once screens refresh, the values match.
- **Wire instructions:** the Banking tab and Fund Setup show the same saved instructions and refresh together. The full account details stay hidden as they are now.

## Not changing
- Who can see or edit what.
- How wire instructions are protected.
- Approval rules.

## Technical details
- Add `src/lib/fund-query-keys.ts` with `invalidateFund(qc, fundId)`. It invalidates `client-fund`, `client-fund-tabs`, `client-fund-cap`, `fund-setup-canonical`, `fund-setup-p3`, `staff-fund-setup`, `fund-entity`, `fund-page`, `managed-wire-instructions`, `fund-investor-grid`, `fund-readiness`, `ops-record*` and the fund setup list.
- Call it from `fund-setup-canonical.tsx` `refresh`, `fund-setup-phase3.tsx`, `fund-banking.tsx`, the team and fees save handlers, and the legal name change.
- Point the fund-setup-phase3 bank step's display at the canonical wire instructions where it currently shows `fund_banking_setups.bank_name`.
- Add an AGENTS.md rule: fund mutations invalidate through `invalidateFund`.
