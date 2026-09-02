# Investor Onboarding: KYC/AML, Accreditation, Docs & Funding

A guided investor onboarding wizard with real identity verification, e-signed fund documents, real ACH funding, and an admin review console.

## Investor flow (step-by-step wizard, resumable)

1. **Account & profile** — sign up/sign in, then investor type (individual, joint, entity, trust/IRA), legal name, address, DOB/EIN, phone.
2. **KYC / AML** — identity verification via a third-party provider (Persona recommended: government ID + selfie, plus watchlist/PEP/sanctions AML screening). Investor is sent into the provider's hosted flow; result returns by webhook and updates status (pending / approved / needs review / declined).
3. **Accreditation** — offering type drives the path:
   - **506(b)**: self-certification questionnaire (income, net worth, professional certification, entity qualification) with attestation and signature.
   - **506(c)**: verification required — upload evidence (W-2s, tax returns, brokerage statements, credit report) or a third-party letter from CPA/attorney/broker-dealer; goes to admin/provider verification. No investment allowed until verified.
   - Pre-existing-relationship note captured for 506(b), verification expiry (90 days) tracked for 506(c).
4. **Fund documents** — investor reviews subscription agreement, PPM, and LPA/operating agreement in an in-app viewer with scroll-tracked "reviewed" state, fills subscription details (commitment amount, ownership/title, tax info), then signs.
5. **E-signature (built in)** — typed or drawn signature, initials on required pages, consent-to-electronic-signature checkbox, and a full audit trail (name, email, IP, user agent, timestamps, document hash). A signed PDF is generated and stored; investor and admin can download it.
6. **Funding method** — choose:
   - **Wire**: display fund wire instructions, generate a reference code, let investor mark "wire sent" with expected date; admin confirms receipt.
   - **ACH**: real bank debit. Investor links a bank account and the commitment amount is debited; status tracked through processing/settled/failed/returned.
7. **Status dashboard** — progress tracker showing each step's state, pending items, documents, and funding status.

## Admin console

- Queue of investors with filters by status (KYC, AML, accreditation, signature, funding).
- Detail view: verification results and flags from the provider, accreditation evidence, signed documents with audit trail, funding record.
- Actions: approve/reject accreditation, request more info, mark wire received, void/re-issue documents, add internal notes.
- Offering settings: which offering is 506(b) vs 506(c), minimum investment, wire instructions, document set.
- Roles stored in a separate roles table; admin-only routes and server-side role checks.

## Technical approach

- **Backend**: Lovable Cloud (Postgres + auth + storage + server functions). Tables: `profiles`, `user_roles`, `offerings`, `investor_applications`, `kyc_verifications`, `aml_screenings`, `accreditation_records`, `accreditation_documents`, `documents`, `signatures`, `signature_audit_events`, `subscriptions`, `funding_instructions`, `payments`, `admin_notes`. RLS: investors read/write only their own rows; admins via `has_role()` security-definer function; grants issued per table.
- **KYC/AML/accreditation provider**: Persona (hosted inquiry + webhook). Requires a Persona account and API key/template IDs; I'll request them securely when we get there. Webhook lands at `/api/public/persona-webhook` with signature verification.
- **ACH**: Stripe ACH debits (Financial Connections for instant bank linking, plus micro-deposit fallback). Requires enabling payments; webhook at `/api/public/stripe-webhook` for `payment_intent` and ACH return events.
- **E-sign**: signature captured client-side, PDF generated and stored in Cloud storage with a SHA-256 hash and immutable audit event rows.
- **Routing**: TanStack Start routes — `/` (offering intro + start), `/onboarding/*` wizard steps under an authenticated layout, `/dashboard`, `/admin/*`. All mutations via server functions with Zod validation and auth middleware.
- **Compliance guards**: server-side enforcement that funding cannot begin until KYC/AML cleared, accreditation satisfied for the offering type, and documents signed.

## Build order

1. Cloud setup, auth, roles, schema + RLS.
2. Wizard shell, profile step, status dashboard.
3. Accreditation 506(b)/506(c) flows with evidence upload.
4. Document review + built-in e-sign with audit trail and PDF.
5. Persona KYC/AML integration + webhook (needs keys).
6. Wire instructions + Stripe ACH debit + webhook (needs payments enabled).
7. Admin console.

## Notes

- Persona keys and Stripe payments setup are required for steps 5–6; the rest is fully buildable first, and those steps will show clear "not configured" states until connected.
- This is software workflow support, not legal advice — document templates and wire instructions must be supplied/approved by your counsel.
