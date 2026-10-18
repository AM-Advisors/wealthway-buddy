# Clean up the "Harmonious only" box on fund Setup

## What changes
1. **Remove duplicates.** EIN and Form SS-4, Tax documents and Sign-off queue already appear on the fund's "Formation & EIN" tab, so the box stops showing them again. It shows a short link to that tab instead. The box also skips any card the main setup steps above already show, such as the formation record and Phase 3 items.
2. **Hide anything that doesn't apply to the fund type.** Each staff card gets an "applies to" rule. Examples: Series LLC formation items show only for Series LLCs. SPV-only or fund-only services show only for the matching type. Launch requirements leave out items the fund type doesn't need. Cards that don't apply don't appear at all.
3. **Hard save completed details.** When a staff card's details are complete and applied (legal name, services, launch requirements), the card closes into a read-only summary. It shows who saved it and when. To change it, a staff member clicks "Reopen", gives a reason, and the reason is logged permanently. Saved values never revert on their own, and the "Waiting on Harmonious" count leaves them out.
4. When everything is complete, the box reads "Nothing needed from Harmonious right now." Below that is a list of the saved summaries.

## Unchanged
- Who can edit and approve stays the same. Every check still runs on the server.
- The manager view, money handling and filings work as they do today.
- The older admin fund page gets the same cleanup.

## Technical details
- `ops-fund-page.tsx`: drop the `fund-operations` section from `setupBody`, since it's already in `OperationsFund` on the formation tab, and add a link to that tab.
- `fund-setup-canonical.tsx` (staffOnly): drop cards the main form already renders. Add a shared `appliesTo(fundType, structure)` helper in a pure module, with a test for Series LLC, SPV and fund.
- Hard save: reuse the existing locked-record pattern (`record-locks.server.ts`). A completed staff card is locked, and reopening it calls a server function that needs a reason and writes an append-only event. Add a focused test that a locked card rejects edits until it's reopened with a reason.
- Re-run the fund-setup tests.
