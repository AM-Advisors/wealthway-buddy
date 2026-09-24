# Company 360 + Investor Preparation

Extends what already exists (company cap table on `ct_*` records, stakeholders, securities, transactions, company documents, reports, the investor onboarding checklist, investment profiles, Didit, accreditation, Box signing, funding and staff roles). No second system gets built for any of these.

## Part A — My Company

1. **Cap Table tab**: shows authorized, issued/outstanding and fully diluted totals, plus ownership by class and by stakeholder. Instruments (options, warrants, SAFEs, notes) get their own section, along with pending (unposted) transactions and the latest effective date. Views: Summary, By Stakeholder, By Security Class, Fully Diluted and As of Date. Every number is calculated from posted securities and transactions, never from totals typed into the page.
2. **Actions** (Add Stakeholder, Issue Security, Record Transaction, Import, Export/Report): shown only to company admins/founders whose company relationship allows editing, and to staff with the matching capability. Managing a fund that holds the company's shares does not grant edit access.
3. **Stakeholders directory**: each row shows type, email, relationship, securities, ownership (where the viewer is allowed to see it), document status, access status and whether the person has an account. Clicking a row opens a detail view with Overview, Holdings, Transactions, Documents and Activity. When nothing has been issued, it says "No securities issued to this stakeholder yet."
4. **Transactions ledger**: lists equity events only (never fund bank payments). Each row shows date, type, stakeholders, class, quantity, price, status, source document, who recorded it and an audit link. Events move Draft → Review → Posted, and posted events are locked. Corrections go through a reversal/replacement entry that points back to the original.
5. **Documents**: grouped as Corporate, Equity, Financing, Valuation/Tax and Reports. Each document can be linked to the company, a stakeholder, a security, a transaction or a round. Where a file sits in Drive never decides its legal status.
6. **Reports**: Current, Fully Diluted, By Stakeholder, By Class, Transaction Ledger, Stakeholder Register, As-of, and a Round summary. All of them are generated live from posted records and can be exported as CSV. Waterfall/scenario reports are left out for now because the data doesn't support them yet.

## Part B — Investor preparation

7. **Add Investor** gets two modes:
   - **Quick Invite**: name, email, amount and profile type.
   - **Prepare Investor**: a guided draft covering Investor → Profile & related people → Agreements → Review.
8. **Agreements**: only this fund's approved documents are listed. The fund's setup pre-selects Required documents, which can't be removed. Optional and Investor-specific documents can be added. Each document shows its signing mode (investor only, investor → manager countersignature, acknowledgement, none). Sending is blocked if a document's signing template isn't ready.
9. **Prepared data**: every prefilled field records its source (Prepared by Fund Manager or Prepared by Harmonious) and keeps four separate states: Prepared, Investor Confirmed, Provider Verified and Harmonious Approved. Entity, trust and IRA profiles can include placeholders for related people (trustee, beneficial owner, control person, signer). Those people still complete their own verification.
10. **Guardrails**: preparers can never approve KYC/AML/sanctions, certify accreditation or tax forms, answer Bad Actor questions, accept certifications, sign for the investor, or mark money received or funded. The server rejects these fields.
11. **Save Draft / Send**: a draft sends no invitation and creates no acceptance, signature or funding state. Before sending, a preview shows the investor, requirements (verification, tax, accreditation, eligibility), documents, signing and expected funding.
12. **Investor review**: when onboarding opens, prefilled fields show with Confirm or Correct. Correcting a key field (legal name, entity, control, commitment, tax classification) recalculates the requirements on the server.
13. **Document merge fields**: filled from the confirmed profile when the document is generated. The profile stays the source of truth.
14. **Staff assist**: staff can prepare or correct drafts for any fund they're authorized for. Each change records who made it, in what role, the before and after values, and a reason.
15. **Manager list and Action Center**: the manager's investor table adds Prepared, Invitation, Verification, Accreditation, Documents, Funding and Next action columns, with evidence kept hidden. New Action Center items: draft ready to send, investor needs to confirm, missing required document, countersignature required, Harmonious review required.

## Technical details

- One additive migration:
  - `investor_prep_drafts`: fund, created_by, preparer_capacity, status (draft, sent, cancelled).
  - `investor_prep_fields`: field key, value, source, the four state columns, and immutable history rows.
  - `investor_prep_documents`: fund document ID, requirement (required, optional, investor_specific) and signing mode.
  - `investor_prep_related_people`.
  - `ct_transactions` gets `posting_status`, `reverses_transaction_id` and a trigger that locks posted rows.
  - Document link columns on company documents.
  - All new tables get GRANTs and RLS scoped to the exact fund-manager relationship or staff capability.
- Pure rule modules `company-360-model.ts` and `investor-prep-model.ts`, used by server functions and tests.
- Server functions reuse the existing fund-manager, company and staff checks. They never authorize by email domain.
- Tests cover every item in sections 25 and 26 of the brief. Then the full test suite, typecheck and build.
- Browser QA, desktop and phone: only possible with test accounts for a founder, a fund manager and a staff member. If those don't exist, this stays open and gets reported. No production records are created.
