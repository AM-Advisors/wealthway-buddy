# Harmonious CapTable

Build the full ownership operating system — cap table, employee equity, investor records, fundraising, secondaries, SPV/exposure verification, migration from Carta and Pulley, documents, compliance history and reporting — replacing today's cap table pages in place.

Decisions locked in: rebuild the existing cap table screens in place, demo data available only through a clearly marked demo mode (never mixed into real client records), delivery in phases you approve one at a time, migration by file upload with automatic format detection and field mapping (no provider API).

## How the product hangs together

Twelve areas in the CapTable navigation: Overview, Cap Table, Securities, Employees, Investors, Fundraising, Secondaries, Compliance, Documents, Reports, Migration, Settings. Each area respects role — founder/CEO/CFO/general counsel/company admin see company-wide data; employees see only their own grants; investors see only their own position; fund and SPV managers see only their claimed exposure; outside counsel sees only what is shared with them; Harmonious staff see an administrative view.

The ledger is event-based. Every issuance, grant, exercise, cancellation, conversion, transfer, consent and correction is recorded as a dated transaction, and the current cap table is derived from that history. Nothing overwrites a balance silently, so any figure on screen can be traced back to the events and documents behind it.

Safety rules applied everywhere: an uploaded document, an outside exposure claim, a migration import or a secondary request never changes the official ledger on its own — each needs the matching approval or reconciliation step. Statuses stay clearly separated: Recorded, Pending, Verified, Approved, Rejected, Unverified. Verification language is recordkeeping language only; nothing states or implies that Harmonious or a regulator has approved an investment.

## Phases

### Phase 1 — Foundation and cap table
Ownership data model (companies, stakeholders, security classes, securities, issuances, transactions, vesting, documents, audit events, notifications) with organization isolation and role-based access. Rebuilt cap table with common, preferred, options, RSUs, warrants, SAFEs, notes, profits interests, SPV and fund interests. Views by stakeholder, by security, by round, fully diluted, as-converted and historical. Founder Overview dashboard with ownership totals, pending items and an Ownership Health panel. Demo mode toggle with a full fictional company.

### Phase 2 — Employees and investors
Employee equity centre with grants, vesting, exercise prices, 409A references, expiry and documents. Employee portal for viewing and accepting grants, tracking vesting, requesting exercises and participating in approved liquidity. Individual investor portals showing only their own holdings, documents, transactions and tax records, with company-controlled permissions.

### Phase 3 — Fundraising and securities issuance
Priced rounds, SAFEs, notes, SPVs and direct investments, tracking commitment, documents, identity and accreditation checks, signing, funding, closing and issuance. Approved closings post to the ledger. Scenario modelling for new financings, conversions, pool expansion, grants, secondaries, tender offers and buybacks — always separate from the official record.

### Phase 4 — Secondaries, SPVs and verification
Secondary control centre with transfer requests, restriction review, right of first refusal, company consent, closing and ledger update, each stage owned, dated, documented and audited. Exposure verification for SPVs, funds, advisers and investors with the full document set and verification statuses. Issuer authorisation registry of recognised positions. Case management for reports of potential unauthorised offerings, compared against company records. Ownership chain visualisation that respects confidentiality.

### Phase 5 — Migration centre
Migration home with Carta, Pulley, other provider, spreadsheet, manual and Harmonious-assisted paths. Dedicated Carta and Pulley experiences: drag-and-drop multi-file upload, automatic format recognition, field mapping with confidence and status, reconciliation of share counts and stakeholder totals, exception review, approval, go-live. Document matching to stakeholders, securities, transactions, rounds and grants, flagging missing, duplicate, unmatched and conflicting files — no uploaded file is ever discarded. Migration health screen, concierge workspace with specialist, progress and secure messaging, and a permanent migration audit record with a reconciliation report.

### Phase 6 — Documents, compliance, reports, notifications, landing page
Document vault covering certificates through 409A reports, linked to the records they support. Compliance and audit history with filters and export. Reports for cap table, ownership, ledgers, vesting, convertibles, secondaries, exposure, verification, migration reconciliation and audit history in PDF, CSV and XLSX. In-app notification centre wired for later email. Public landing page with the hero, migration section, secondaries, employee and migration positioning and the differentiation message.

## Technical notes

- Database: new ownership schema in the existing backend, row-level security scoped by organisation and role, grants for every new table, event tables as the source of truth with derived balance views.
- Existing routes `/client/cap-table`, `/admin/cap-table*`, `/admin/client-cap-tables` and the shares/certificate pages are rebuilt against the new model; current certificate, onboarding and plan features are carried over, not discarded.
- Demo mode is a flagged company plus a session toggle; real client data is never blended with it.
- Migration parsing runs server-side (CSV/XLSX plus document attachment handling) with source files retained in private storage.
- Design follows the existing Harmonious system — Rubik/Poppins, navy and teal, dense readable tables, status badges, detail panels, audit timelines, strong empty and error states, responsive across phone and desktop.

Each phase ends with working screens you can click through before the next begins.
