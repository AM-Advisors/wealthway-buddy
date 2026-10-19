# Investor profile and investment steps in Record history

## What managers will see
A **Record history** view that shows, for each investor in a fund, who completed or changed each step and when:
- **Profile:** profile created, details updated, documents uploaded or updated, verification submitted, approved or declined (recorded results only; no ID numbers or documents shown).
- **Investment steps:** Review the deal, About You submitted, Verification complete, documents signed, approved to fund, funds received / funding released, accepted, closed, removed.
- **Changes:** amount and detail edits already recorded (for example Dustin setting Calvin Jung to $500,000), plus personal link created, emailed or copied.

Each line shows the step, who did it (investor, fund manager or "Harmonious team"), date and time, and before/after values where they exist.

## Where
- **Fund managers:** a new "History" tab on each investor's page, plus a fund-wide Record history list under the fund's Investors section, filterable by investor and step. Managers only see investors in funds they manage.
- **Harmonious staff:** the existing Audit log → Record history tab gains the same investor step entries.

## Rules
- Read-only; history can't be edited or deleted.
- Managers see staff actions as "Harmonious team" rather than individual staff names.
- Older steps that were saved before step recording existed show "who" only when it was recorded; otherwise "Not recorded". Nothing is guessed.
- Access is checked on the server, so seeing a tab grants nothing extra.

## Technical notes
- New shared reader `investor-step-history.server.ts` merging: `investor_onboardings` step timestamps/actors (questionnaire_submitted_at, approved_to_fund_by/at, funding_released_at, accepted_by/at, closed_by/at, removed_by/at, investor_confirmed_at), `investor_record_changes`, `investment_profile_events` (profile_id-linked), identity check status timestamps, signature records, personal_link_* events.
- Pure normaliser in `investor-step-history-model.ts` (step labels, actor masking, sort) with unit tests: manager can't read other funds' investors, staff names masked for managers, missing actor → "Not recorded".
- Manager server fn guarded by managed-offering check; staff path reuses requireStaff in audit-log.functions.ts.
- UI: tab on `manager.fund.$fundId.investor.$onboardingId.tsx`, fund-level list route under manager investors, staff entries appended in admin.audit Record history.
