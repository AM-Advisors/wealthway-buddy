# KYC/AML submissions with documents and a review trail

Today an investor fills in identity details and the AML questionnaire during onboarding, and a fund
can see a status badge per investor. Two things are missing: documents attached to those checks, and
a permanent history of what was submitted and decided. This adds both.

## What gets built

### 1. Investor side — one KYC/AML submission form

A single page in the investor portal that combines identity details, the AML questionnaire and
document upload, tied to the fund the investor is applying to.

- Identity fields and AML answers reuse the existing onboarding steps, so nothing already working is
  rebuilt; the page adds a document section.
- Upload slots: government ID, proof of address, entity formation papers, source-of-funds evidence,
  other. Multiple files allowed, private storage, size and type checked.
- On submit, the check moves to "In review" and the submission is written to the history.
- If a fund asks for more information, the investor sees the request and note at the top of the page
  and can submit again; the earlier submission stays in the history.

### 2. Fund side — status list with review and decision

Extend the existing investor compliance panel inside each fund.

- Per investor: identity status, AML status, accreditation status, when last submitted, what is
  outstanding.
- Open an investor to see every submission in order, the answers given, the attached files (opened
  through short-lived secure links) and every decision.
- Fund managers can upload documents on an investor's behalf, marked as received from the fund with
  who uploaded it.
- Decisions: Approve, Decline, or Request more information, each with a note the investor sees.
  Declining or requesting information sets the investor's check back to the right state.
- Fund managers only see investors in funds assigned to them; Harmonious admins see everything.

### 3. The trail

Every submission and decision is recorded permanently and cannot be edited or deleted: who acted,
when, which check, the answers or files involved, and the note. Shown on both the fund view and the
investor's own page so both sides see the same record.

## Technical notes

- New table `compliance_submissions`: application_id, offering_id, user_id, check kind
  (kyc | aml | accreditation), action (submitted | approved | declined | info_requested |
  document_added), actor_id, actor_role, payload jsonb (answers snapshot, file references), note,
  created_at. Insert-only: grants for `authenticated` and `service_role`, RLS letting the investor
  read their own rows, fund managers read rows for funds they are assigned to via `fund_managers`,
  admins read all; no update or delete policies.
- Documents reuse `investor_documents` (already has offering_id, doc_kind, review_status,
  reviewed_by) plus the existing private storage bucket and signed-URL helper used by
  `fund-compliance.functions.ts`.
- New `src/lib/kyc-aml.functions.ts` for submit, upload-on-behalf, decide and history reads, all
  behind `requireSupabaseAuth` with the same reviewer check `assertFundReviewer` already applies.
- Investor page at `/onboarding/compliance`, with the existing KYC and AML steps linking into it;
  fund view extends `src/components/fund-compliance-panel.tsx` with a detail drawer and decision
  actions.
- Decisions write to `kyc_verifications` / `aml_screenings` / `accreditation_records` status and to
  `investor_applications` status fields, keeping current onboarding gating intact, plus an
  `audit`-style row in the new trail.
