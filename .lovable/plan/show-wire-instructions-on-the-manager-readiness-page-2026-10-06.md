# Show wire instructions on the manager Readiness page

## What changes

Add a read-only "Bank & wire instructions" card at the top of the Investor Readiness page (`FundReadiness` in `src/components/investment-readiness.tsx`), so a fund manager can see the fund's bank details without opening Fund Setup.

- **Data:** new server function `getFundWireInstructions` in `src/lib/wire-instructions.functions.ts`, scoped to the fund. It reuses the existing `get_wire_instructions` RPC, which is already gated by `can_read_wire_instructions` (Harmonious staff and managers of that fund only). No new permission path.
- **Display:** bank name, account name, routing number, account number (masked except last 4), SWIFT, bank address and memo, plus "last updated" date. Read-only — editing stays in Fund Setup / Banking so there is still one place to change it.
- **Empty state:** if no wire instructions are saved yet, the card says so and links the manager to the Banking tab to add them.
- **Refresh:** the card uses the shared fund query keys (`src/lib/fund-query-keys.ts`) so saving wire instructions in Fund Setup or the Banking tab refreshes this card automatically.

## Note on investor visibility

The Readiness page is visible to Harmonious staff and the fund's managers — investors never see it. Investors already see the fund's wire instructions during the Fund step of their own onboarding portal, so no change is needed there. If you also want investors to see bank details somewhere new, that would be a separate change.

## Technical details

- Files: `src/lib/wire-instructions.functions.ts` (new `getFundWireInstructions` server fn, manager/admin scope check via `fund_managers` like `managedOfferingIds`), `src/components/investment-readiness.tsx` (new card above the counts grid).
- Account number masked server-side (last 4 only) before it leaves the server.
- Verify with typecheck/build; no data changes.
