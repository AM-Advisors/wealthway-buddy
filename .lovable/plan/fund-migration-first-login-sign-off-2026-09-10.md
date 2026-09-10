# Fund migration + first-login sign-off

Two additions: super admins can bring an existing fund onto the platform (records import plus a transfer checklist), and every new person must accept the policies before they can use anything.

## 1. Bringing a fund across

A new "Migration" section on each fund, visible to super admins only.

**Transfer checklist** — one record per fund with a status (Not started, In progress, Records loaded, Balances confirmed, Complete) and standard steps:
- Prior administrator named, records-as-of date recorded
- Investor list received
- Commitments and funded amounts confirmed
- Signed subscription documents loaded
- Banking and wire details confirmed
- Investor access invitations sent

Each step is checked off with who did it and when, plus a note. All changes are written to the audit trail.

**Loading investors** — two ways, both feeding the same review table:
- Upload a spreadsheet (CSV or Excel). Columns: name, email, investor type, commitment, amount funded, units, closing date, accreditation status, notes. A sample file is downloadable.
- Add or edit a row by hand.

Rows are staged first, never written straight into the live fund. The review table flags missing emails, duplicates, bad numbers and emails already on another fund. Nothing imports while a row shows an error. When staff confirm, each accepted row becomes an investor record on the fund with its commitment, funded amount and closing date, marked as migrated with the source administrator and as-of date so the history is clear. Rows can be re-run after fixing errors; already-imported rows are skipped rather than duplicated.

Sending portal invitations is a separate, deliberate action after import, so migrated records can be reconciled quietly first.

## 2. Sign-off before first use

Four policy documents, each with a version and effective date, editable by super admins: Privacy notice, Platform terms of use, Fee schedule, and Electronic records and signatures consent.

Every signed-in person — staff included — sees a single acceptance screen before anything else loads. It shows each document, requires opening each one, then a typed name and one "I agree" action recording all four versions at once, with the time and the browser's address for the record. Sign out is the only other option.

If a document is later republished at a new version, the affected people are asked again on their next visit, and only for what changed. A "Policy acceptances" list under Pricing and agreements shows who accepted what and when, downloadable as a spreadsheet.

## Technical notes

- Migration: `fund_migrations` (one per offering, status, prior administrator, records_as_of, `steps` JSONB, note) and `fund_migration_rows` (staging: parsed fields, row status, error text, created application id). Both super-admin-managed via RLS; staff read-only.
- Import runs in a server function under `src/lib/fund-migration.functions.ts`, gated on the `super_admin` role, writing `profiles`, `investor_applications` and cap positions inside the existing patterns, and logging to `contract_audit_events` / `offering_audit_events`.
- Spreadsheet parsing happens client-side; only normalised rows go to the server.
- Sign-off: `policy_documents` (kind, version, title, body, effective_date, published) and `policy_acceptances` (user_id, document_id, version, accepted_at, signer_name, ip). Read for own rows by any authenticated user, insert own only; super admins manage documents.
- Gate renders in `src/routes/_authenticated/route.tsx` wrapping `PortalGate`, driven by a server function returning outstanding documents; it also short-circuits every protected server call path by re-checking on the server for money-movement and application actions.
- New screens: `admin.fund-migration.$fundId.tsx`, a Migration tab on the fund page, and Policies + Acceptances tabs under `/admin/pricing`.
