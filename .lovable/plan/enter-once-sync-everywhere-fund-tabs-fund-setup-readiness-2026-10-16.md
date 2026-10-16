# Enter once, sync everywhere (Fund tabs + Fund Setup + Readiness)

## Goal
Any fund detail typed in one place (Fund Details, Banking, Asset Details, Investors, or Fund Setup) shows up in every other place and updates the readiness score right away, with no re-entry.

## What changes for users
- One value per fact: EIN, entity type, series master, registered agent, investor minimum, regulatory exemption, wire instructions, Drive folder, tax/accounting/reporting choices.
- Saving on any tab also refreshes Fund Setup and the Readiness percentage on the next view, and the fund history shows "Synced from <tab>".
- Fields shown in two places become the same field (same value, same lock/review status) instead of separate copies.
- Automatic check-offs (entity formed, EIN received, bank active, tax/accounting/reporting defaults) fire from whichever page the data was entered on.

## Steps
1. Inventory every fund field across the fund tabs and Fund Setup form; map each to one canonical home (offering record, private entity details, private wire instructions, or setup config).
2. Build one shared save path per fact; point both the tab forms and the Fund Setup form at it (removes duplicate storage).
3. After every save, run the existing automatic check-off and default rules, then refresh readiness so the score is identical on Fund Setup, Readiness and the fund header.
4. Refresh cached screen data after saves so the other tab shows the new value without a reload.
5. One-time reconcile: where a fund already has differing values in two places, keep them both visible as a conflict for staff to pick — never silently overwrite.
6. Tests: entering EIN / wire / exemption / minimum on a fund tab completes the matching readiness item; conflicts are flagged, not overwritten.

## Safety (unchanged)
Sync never approves anything, never un-completes tasks, never sends money or filings; manager edits still go to review; every change is logged.

## Technical details
- New `src/lib/fund-facts.server.ts`: `saveFundFact(offeringId, key, value, actor)` dispatching to existing stores (`offerings`, `save_wire_instructions`, entity-details RPC, regulatory/eligibility configs), then `syncAutoCompletedTasks` + `autoDefaultSetup`.
- Field registry in `fund-setup-form-model.ts` reused by `fund-workspace.tsx` tabs so labels/keys can't drift.
- Readiness stays sourced only from `fund-launch-summary.ts`; invalidate its query keys after saves.
- AGENTS.md rule: fund facts have one canonical store written through fund-facts.server.ts.
