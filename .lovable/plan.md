# Agreements & SOW — enterprise contracting workspace

A single place where a client sees their Master Services Agreement, every fund they already
run (on the pricing they originally signed), and a guided path to request a new fund, review
its Statement of Work section by section, ask for changes, and sign. Harmonious staff get a
matching contract administration desk.

Existing agreement records, pricing versions, scope rules and signatures already in the
platform stay in place — this builds the contracting experience on top of them rather than
replacing them.

## What the client sees

**Agreements home**
- Master agreement card: version, effective date, status, View.
- Active engagements: each existing fund with service type, effective date, status, the
  pricing version it was signed on, and its executed SOW. A standing line states that
  existing engagements continue under the terms of their executed SOW unless amended in
  writing.
- New / pending: SOWs awaiting review or signature, with Review & Sign.
- Prominent **+ Request new fund**.

**Request a new fund**
Guided steps: fund/SPV name, entity type, jurisdiction, fund type, target raise, expected
investors, expected investments, expected launch date, primary contact. On submission the
request goes to Harmonious, the current published pricing is captured as a frozen snapshot
for that request, and a draft SOW is generated from the client, fund details, selected
services, that pricing and the governing MSA.

**SOW review**
A summary first — fund, services, pricing lines, total — then a sectioned review:
Fund information, Services, Pricing, Responsibilities, Terms, MSA, Signature. Previous /
Next, a progress rail with tick marks, and View full agreement. Each section ends with
"I approve this section" or "I'd like to request a change". Requesting a change opens a form
showing the current term and collecting the requested change and reason. Clients never edit
Harmonious's language directly.

**Change center**
Every request tracked with section, original, client request, Harmonious response, final
language and status (requested, under review, approved, declined, countered, resolved).
A counter can be accepted by the client or met with another request. Full negotiation
history is kept.

**Final review and signature**
Either "No changes to standard terms" or an Agreed changes schedule showing only the
differences, each marked approved by both sides. Required approval checkbox, plus a second
one confirming the agreed-changes schedule when changes exist. Professional signature blocks
for the client and for Harmonious Capital Administration: company, name, title, typed
signature, auto date. Each signature records signer, email, role, timestamp, agreement
version and request metadata as an audit event.

**Execution**
When both signatures are in, the SOW is marked executed and locked: an immutable snapshot
stores the SOW version, MSA version, pricing version, services, agreed changes, both
signatures, execution date and audit history, with a downloadable executed document.
Confirmation screen: "You're all set" with Begin fund onboarding as the primary action and
Download executed SOW secondary. Onboarding for the new fund starts from there.

**MSA**
The same review flow over the twelve standard sections (services framework, client
responsibilities, fees & payment, confidentiality, data & security, third-party providers,
representations, indemnification, limitation of liability, term & termination, dispute
resolution, general terms), each marked Standard or Change requested, with a final review
that collapses unchanged sections and expands only modified ones, then signature and lock.
Clients are not asked to re-execute the MSA for each new fund unless Harmonious issues a new
MSA version.

**Show changes only / show full agreement**
A comparison view throughout marking added, removed and modified language.

## What Harmonious staff see

A contract administration board listing client, agreement, fund, current stage, changes
requested, assigned reviewer, client signature, Harmonious signature and last activity, with
filters for needs Harmonious review, needs client review, awaiting client signature,
awaiting Harmonious signature and executed. Authorized staff can generate a SOW, choose the
pricing version, select services, apply a discount or custom/waived price with a required
reason, add special terms, approve/decline/counter requested changes, send for signature,
countersign and download executed agreements. Standard price and the adjustment are kept
internally; the client sees only the final approved price.

Pricing management keeps versions with effective dates — archived versions stay readable and
executed SOWs never re-price when a new schedule is published.

**Amendments:** an executed SOW is never edited. "Amend SOW" creates a numbered amendment
showing existing terms, requested change, new terms and effective date, routed through the
same approval and signature flow and linked to the original.

## Technical notes

New tables (all with grants, RLS scoped to the owning client plus staff roles, and
timestamps):
- `msa_versions`, `msa_sections` — versioned MSA body; `client_msa_agreements` for a
  client's acceptance state, section approvals and signatures.
- `fund_requests` — the new-fund intake, linked to the created `offerings` row once approved.
- `sow_documents` layered on existing `client_sows`: `sow_sections` (ordered body per SOW),
  `sow_section_approvals` (client approve / change-requested state).
- `sow_pricing_snapshots` + line items — frozen copy of the pricing version applied, holding
  standard price, adjustment, reason and final client-facing price.
- `agreement_change_requests` + `agreement_change_messages` — negotiation thread with status
  machine and final agreed language.
- `agreement_signatures` — signer, email, role, typed name, title, timestamp, version, IP and
  user agent, for both MSA and SOW.
- `agreement_executions` — immutable JSONB snapshot at execution, plus generated document path.
- `sow_amendments` — numbered amendments linked to the parent SOW.
Existing `contract_audit_events` records every state change.

Server functions in new `src/lib/agreements.functions.ts` (client-facing: list agreements,
submit fund request, section approve, raise change, accept counter, sign) and
`src/lib/agreements-admin.functions.ts` (generate SOW, set pricing/discount, respond to
changes, countersign, execute, amend), all under `requireSupabaseAuth` with the existing
staff-role and contract-authority checks. Execution and countersigning validate that every
section is approved, every change resolved and both checkboxes recorded.

Routes: `/client/agreements` rebuilt as the agreements home with nested
`request-fund`, `sow/$sowId` (review, changes, final review, sign) and `msa`;
`/admin/agreements` for the administration board, reusing the existing pricing console.
Executed documents render through the existing branded HTML-to-PDF document pipeline used
for invoices and certificates.

Demo data: a fictional client with an executed MSA v4.0, Fund I on 2025 pricing, Fund II on
2026 pricing and Fund III pending signature on September 2026 pricing, so the full path can
be walked end to end.

## Delivery order

1. Data model, pricing snapshots, audit wiring, demo data.
2. Client agreements home and existing-fund history.
3. Request new fund → SOW generation.
4. Sectioned review, approvals, change center.
5. Final review, signatures, execution lock, executed document, onboarding handoff.
6. MSA review and signature flow.
7. Admin contract administration board, discounts, amendments.
8. End-to-end walkthrough of the full negotiation and execution path.
