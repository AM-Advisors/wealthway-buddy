# Phase 4: K-1s, Form 1065 detail, Form PF and IRS records in the Tax workspace

## Goal
Bring the other project's tax depth into our existing Tax workspace, built on our tax years, allocation runs, 1065 returns and K-1s. Every new record is append-only: corrections add a new version, and nothing is overwritten or deleted. Nothing is filed, transmitted or sent to the IRS or SEC from the app.

## What already exists (kept as the base)
- Tax years, book-to-tax adjustments, allocation runs, 1065 preparation, K-1 generation/amendment, 1042/1099, all with maker-checker and locked history.

## What gets added

**1. Form 1065 detail (per prepared 1065)**
- Line-by-line schedules: Page 1, Schedule B (other information), Schedule K, Schedule L (balance sheet), Schedule M-1 (book-to-tax), Schedule M-2 (partners' capital), Analysis of net income.
- Values pre-filled from our allocation run and book-to-tax bridge where we have them; the rest entered by the preparer.
- Each save is a new detail version with who/when; earlier versions stay readable.
- Tie checks shown before review: Schedule K equals the sum of K-1s, M-1 ends at Schedule K income, M-2 ending capital equals the sum of partner capital, Schedule L balances.
- Review requires a different team member, as today.

**2. K-1 history**
- Per Fund and year: every K-1 with all its versions, line changes between versions, who prepared/reviewed/approved, and the reason for each amendment. Read-only view over our existing locked K-1 records.

**3. Form PF records**
- One record per adviser and reporting period: adviser name, CRD and SEC file numbers, smaller/large adviser, annual/quarterly, period end, due date, which Funds are included, sections required, regulatory assets.
- Steps: Draft → Ready for review → Reviewed (different person) → Filed by adviser (date and filing confirmation recorded by staff).
- Every change is a new version; filed records are locked.

**4. IRS records**
- A log of IRS correspondence per Fund: notices received (e.g. CP575, penalty notices, acceptance/rejection acknowledgements), letters sent, phone calls, with date, notice number, tax year, form, response due date, uploaded copy and status (Open, Responded, Closed).
- Entries are append-only; status changes add a new entry.
- Open items with a due date appear in the Tax area's "Waiting now".

## Who can see what
- Harmonious tax staff: everything.
- Fund managers: their own Fund's 1065 summary and tie-check results, K-1 status, and IRS notices marked "share with manager". Never Form PF internals, staff notes or other Funds.
- Investors: unchanged (their own approved K-1s only).
- Sales: no access.

## Not brought over
- The other project's direct IRS connection (e-file keys, sign-in to IRS systems, transmission logs). Filing stays outside the app, as you require.

## Technical details
- Migration: `partnership_return_details` (return_id, version, schedules jsonb, tie_results jsonb, prepared_by), `form_pf_filings` + `form_pf_versions`, `irs_correspondence` with append-only `irs_correspondence_events`; GRANT service_role only, RLS on, append-only triggers; no raw TINs (existing `assertNoRawTin`).
- `src/lib/form-1065-detail.ts` (pure line catalogue, prefill, tie checks), `form-pf.ts`, `irs-records.ts` + `.server.ts`/`.functions.ts` gated by existing `assertTaxStaff` / fund-scoped manager reads.
- UI: tabs on the Tax workspace (Returns & forms, 1065 detail, K-1 history, Form PF, IRS records); 1065 detail page per return; manager Tax page gets the summary panel.
- Tests for tie checks, version append, reviewer separation, manager masking. Record the rule in src/lib/AGENTS.md.
