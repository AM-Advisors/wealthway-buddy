# Finish: Investor Record Sync & Manual Entry

Most of the feature is already built. The steps below finish checking it and report back to you.

## Already in place
- **Before sign-in:** the database can now hold a person, investing profile and investment for someone who hasn't signed in yet. When they sign in with the same verified email, those records become theirs. If more than one record could match, it goes to Harmonious for review instead of being merged.
- **Adding investors:** the fund's Investors tab has Create New Investor, which searches existing records first, shows only masked emails and offers Quick Add or full details in sections. Bulk Add Investors shows a preview before anything is saved.
- **Records list:** a new investor records list has a Record Status column and row actions: Open, Edit details, Edit investment, Readiness, Invite, Client view and Remove from Fund.
- **Investor page:** each investor has a fund-scoped page with Overview, Investment, Profile, Onboarding, Readiness, Documents and Activity tabs, plus conflict review for Harmonious staff.
- **Investor confirmation:** investors see a "Please confirm your information" card on their investment page.
- **Change history:** every change records who made it (Investor, Fund Manager or Harmonious) and the before and after values. Values from documents, bulk files or providers become suggested updates and never overwrite silently.
- **Readiness:** readiness is recalculated after every change.
- **Tests:** 28 new tests pass.

## Remaining steps
1. Run the full test suite, type check and production build one at a time, so the combined run doesn't time out again. Fix anything they find.
2. Open the fund Investors tab and an invalid investor page on desktop and phone to check layout and errors. This is view only; no records are created.
3. Save the architecture rule in the project notes; it may not have saved when the last command was cut off.
4. Send the completion report you asked for:
   - manual entry for Harmonious and for Fund Managers
   - how changes stay in sync
   - duplicate matching
   - bulk import
   - conflict resolution
   - investor confirmation
   - who can do what
   - tests added and the final count
   - type-check and build results
   - confirmation that no production investor data was changed

## Known limits to report (not built in this pass)
- Drive import is not connected to suggestions automatically. Staff can create a suggestion from a document, but no Drive import was run.
- Investors don't yet get their own per-field correction history screen. It is recorded in the history log.
- The older investor register table stays beside the new records list. They aren't merged into one table yet.

## Technical details
- Run `tsgo --noEmit`, `bunx vitest run` and `bun run build` as separate commands, each under the time limit.
- Make sure the AGENTS.md rule for `investor-record*` exists exactly once.
