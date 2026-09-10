# Audit log: wires, distributions, investor checks, filings and holds

A new "Audit log" page gives Harmonious staff one read-only, timestamped trail of the
regulated activity that today is spread across separate records — money movement,
investor verification, filings and compliance holds — with filters and a download.

## What the team gets

A new page at Audit log, linked from the admin sidebar, with tabs:

**Money movement** — wire requests and their review decision, wire confirmations from
investors and how they were reviewed, payment instructions with their verification,
callback, compliance and bank status, every approval or rejection recorded against a
dual-approval instruction, and investor payments as they move through settlement.
Each row shows amount, fund, who acted, when, and the note left behind.

**Distributions** — every distribution recorded against a fund: date paid, amount,
kind, note and who entered it.

**Investor checks** — identity verification, AML screening and accreditation records:
provider, status or result, when it completed, and who reviewed it. Screening matches
are shown as a count with the reviewer's status, never as a determination.

**Filings and compliance items** — each fund's compliance item with its category,
status, due date, filed date, owner, reference and note.

**Holds** — every compliance hold ever placed: what was paused, the reason, the client
and fund, who placed it and when, who cleared it and when.

**Scope and fees** — the contract audit trail already being written for scope, pricing,
statements of work, service requests and fund condition clearances: area, action,
target, before/after and the acting role.

Every tab shares the same controls: a date range (last 7/30/90 days, last year, all),
a fund filter, a free-text search across names, references and notes, and a
"Download" button that exports exactly the rows currently shown as a spreadsheet file
for examiners.

Nothing on this page can be edited. All Harmonious staff can open it; client and
investor accounts cannot. Internal hold notes stay staff-only, and no bank account
numbers are shown — accounts appear masked to their last four digits.

## Wording

Entries describe what was recorded and by whom. Screening and verification results are
reported as the provider's outcome and Harmonious's review status, never as a legal,
regulatory or fitness determination.

## Technical notes

- New `src/lib/audit-log.functions.ts` with one staff-gated `createServerFn` per tab
  (`listMoneyAudit`, `listDistributionAudit`, `listInvestorCheckAudit`,
  `listFilingAudit`, `listHoldAudit`, `listScopeAudit`), each taking
  `{ days, offeringId, search, limit, offset }`, reading through
  `requireSupabaseAuth` so RLS applies, and normalising rows to a shared
  `AuditEntry` DTO: `{ id, at, actor, fundName, category, summary, detail, amountCents,
  status }`. Staff check reuses the existing `STAFF_ROLES` pattern from
  `contracts.functions.ts`, not the admin-only check in `admin-activity.functions.ts`.
- Sources: `wire_requests`, `wire_confirmations`, `payment_instructions`,
  `payment_approvals`, `payments`, `fund_distributions`, `kyc_verifications`,
  `aml_screenings`, `accreditation_records`, `fund_compliance_items`,
  `compliance_holds`, `contract_audit_events`. Actor and fund names resolved from
  `profiles` and `offerings` in the same handler.
- New route `src/routes/_authenticated/admin.audit.tsx` with its own `head()` metadata
  and `robots: noindex`, plus `src/components/audit-log-table.tsx` — a shared table
  with the filter bar, pagination and CSV download built client-side from the loaded
  rows.
- Sidebar entry added next to the existing Activity and Document log links.
- No database or schema changes; all reads use existing tables and policies.
