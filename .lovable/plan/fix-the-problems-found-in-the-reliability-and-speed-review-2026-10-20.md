# Fix the problems found in the reliability and speed review

Nobody gains access, no money moves, and no records are deleted. Wire and funding screens are left alone and will get their own reviewed step.

## 1. Billing and commissions (first)
- If a card payment's commission entry fails, a retry finishes it instead of skipping the invoice because it's already paid.
- A billing schedule moves to its next date only after that period's draft invoice is saved.
- Each rep, invoice line and commission layer can have only one payout. The commission tracker shows the amount that was queued when the invoice was paid. It doesn't work it out again from today's roles.
- Finance, the CRO and the CEO can confirm payouts, as intended.
- The daily reminder run is claimed in one safe step and can be retried if it fails partway.
- The schedule job checks every approved SOW, not just the first 500.

## 2. Screens that hide work or show false "empty"
- Operations work areas filter the whole queue, not just its first 100 items.
- A failed load shows "Couldn't load — Retry" instead of "Nothing is waiting" or an empty list. This covers Home, the account check and fund sections.
- Banking summary keeps international wire instructions. Older SWIFT records show the beneficiary and account fields.
- Staff with fund access pass the manager-view checks they're entitled to.
- Valuation queue stops asking for an unsupported "returned" status.
- Funds page refreshes after changes instead of staying out of date for 60 seconds. Removed investors stop counting, so the total is 240, not 241.

## 3. Emails and alerts
- Manager alerts are claimed safely, so two runs can't send the same email twice.
- Progress emails are marked sent only if every check succeeded.
- Readiness updates report a failure when a save fails.

## 4. Speed
- Marketing sync writes only records that actually changed: posts, contacts and Drive files. It skips sources that overlap and stops repeating the missed-run check for every job.
- Add database lookups for the slow marketing queries.
- An investor's fund page loads only that fund's cap table.
- Onboarding and document pages stop checking for updates once a step is complete.
- Saves refresh only the related data, not everything on the page.
- The Funds dashboard loads readiness in parallel, and account checks are cached per request.

## 5. Smaller items
- Null service keys in the price catalog get a safe fallback.
- The deprecated input-check warnings are cleaned up.
- Portal profile creation asks for the required identity fields.
- Client MSA and checklist first saves get the right permissions.

## Needs your decision (not in this plan)
- Moving wire and funding onto the current investment records, as a separate reviewed money-path change
- 6 investors whose account name doesn't match their person record

## Technical details
- Files: billing-schedule.server.ts, commissions.server.ts, invoice-reminders.server.ts, manager-alerts.server.ts, investor-progress-email.server.ts, investor-onboarding.server.ts, marketing-jobs/imports/drive.server.ts, ops-funds.server.ts, require-auth.ts, investor.fund.$offeringId.tsx, onboard-portal.tsx, documents-step.tsx, fund-setup-extras.tsx, investor-document-ai.tsx, valuation.server.ts, and the five *.functions.ts files that use inputValidator.
- Migration: unique index on commission payouts (line, recipient, layer); indexes on marketing_job_runs(created_at) and marketing_research_stories(source_key); RLS insert policies for the client MSA and checklist; atomic claim function for scheduled_job_runs.
- Tests for each rule: retrying a payout, no duplicate payouts, schedule doesn't advance on a failed draft, Finance can confirm, an error isn't shown as empty, one alert claim.
