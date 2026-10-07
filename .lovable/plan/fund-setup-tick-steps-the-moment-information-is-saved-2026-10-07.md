# Fund Setup: tick steps the moment information is saved

## Goal
When someone enters information in a Fund Setup section and saves, that section's required items and its checklist step show as complete right away, on the same screen. No page refresh, no waiting for a later save or background sync. The setup percentage and Next step bar update at the same moment.

## What's wrong today
- **Only some saves check the checklist.** Saving documents, W-9, signers or the EIN ticks the matching step. Saving Fund details, Fees/economics, Bank details, bank review, SS-4, administration, banking path or a new document version does not, so those steps only tick on some later, unrelated save.
- **Step order blocks ticking.** A step whose information is complete stays open if an earlier step isn't done yet. For example, EIN entered stays open until Entity formation is complete. To the user it looks like the save didn't count.
- **The checklist doesn't redraw after some saves.** The Documents section refreshes only its own list, not the checklist or percentage.
- **Some steps have no "complete" rule at all:** Bank account, Investor eligibility, Investor onboarding steps, Compliance configuration. These can only be ticked by hand.

## Changes
1. **Every Fund Setup save re-checks the checklist** before it returns. This covers Fund details, legal name, Fees/economics, classes, bank details, banking path, bank review, wire document, EIN, W-9, SS-4, administration, documents (create, upload, approve, activate), signers and team.
2. **A step ticks when its own information is complete,** whatever the step order. The order still applies to approvals and launch. Harmonious launch approval is never ticked automatically.
3. **Completion rules for the four uncovered steps**, using information already recorded:
   - Bank account: a verified bank-instruction version, or the banking path set to "not required".
   - Investor eligibility: saved eligibility rules.
   - Investor onboarding steps: saved onboarding configuration.
   - Compliance configuration: regulation type and compliance settings saved.
4. **Instant on-screen update.** After any save, the checklist, required-items list, percentage, Next step bar and fund lists all refresh together. That includes the Documents section.
5. **"Missing" hints:** each open step shows what is still missing (for example "Needs certificate of formation") so it's clear why it hasn't ticked.
6. **Steps only move forward.** A completed step is never reopened automatically, and every automatic tick is recorded in the fund's activity history.

## Technical details
- `src/lib/fund-setup-canonical.functions.ts`: wrap every mutating handler with the existing `__auto` helper (offering id resolved from input, fee, document or version). `fund-setup-phase3.server.ts` and `offering-document-setup.server.ts` mutations are covered through those wrappers.
- `src/lib/fund-setup-extras.server.ts` `autoCompleteTasks`:
  - Data-backed steps complete without waiting on their dependencies. Approval and launch steps keep their dependency checks.
  - Add rules for `banking_account`, `investor_eligibility`, `investor_onboarding_steps` and `compliance_config` from the existing bank-instruction, eligibility, onboarding and offering settings records. The exact columns get confirmed against the schema during the build. A step with no reliable record stays manual and is reported.
  - Return the list of missing items per open step for the UI.
- `src/components/offering-documents-setup.tsx` (and any other section that refreshes only its own query) calls `invalidateFund(qc, offeringId)` after saves.
- Fund Setup step rows show the missing-items text from the shared summary. `fund-launch-summary.ts` stays the single source of the percentage.
- Unit tests for the completion rules. Rule updated in `src/lib/AGENTS.md`.
