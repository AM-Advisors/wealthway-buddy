# Phase 7 — SPV exposure claims and verification

Phase 6 (compliance and audit history) is already built and live: the compliance page shows the full trail of ownership changes, ledger entries and documents, with filters by company, shareholder, record type, source and date, plus CSV export. No further work needed there.

This phase adds the outside-party side of the record: funds, SPVs and advisers declare what they believe they hold, and the company confirms or disputes it against the official cap table.

## What gets built

**Submitting a claim — two ways in**

- Secure invite link: the company sends a one-time link to a fund or adviser. They open it, enter the company they are claiming against, the security type, quantity, how they came to hold it (direct purchase, secondary, SPV interest, fund position), the date, and can attach supporting paperwork. No account needed. Links expire and can be revoked.
- Portal account: a claimant who signs in sees a "My claims" area listing everything they have submitted, the decision on each and any follow-up the company asked for.

**Company review desk**

A new "Exposure and verification" page in the cap table area, listing every claim with its status: submitted, under review, verified, partially verified, disputed, withdrawn.

For each claim the reviewer sees the claim side by side with what the official record says for that holder — matching shareholder, securities and balances — with the difference highlighted. They can:
- Verify it (records the confirmation against the register, no shares are created)
- Verify a different quantity, with a note explaining the adjustment
- Ask the claimant for more information
- Dispute it

Verification never silently changes ownership. Correcting the register stays a separate, deliberate action.

**Issuer registry**

A directory of the outside entities that have claimed exposure — fund, SPV, adviser or nominee — with their claims, verified totals and last activity, so the company can see at a glance who is holding through whom.

**Unauthorised activity cases**

A disputed or mismatched claim can be escalated into a tracked case: what was claimed, what the record shows, who raised it, status (open, investigating, resolved, closed), notes over time and linked documents. Cases appear on their own board and on the company's compliance trail.

**Ownership chain**

For a verified claim held through an SPV or fund, the page shows the path from the underlying holder on the register through to the end beneficial party.

Every action — submission, review, verification, dispute, case opening and closure — is written to the same immutable audit trail as Phase 6, so it shows up on the compliance page. Demo companies stay read-only and isolated from real records.

## Technical notes

New tables (RLS, grants, indexes, updated_at triggers, event writes on every mutation):
- `ct_exposure_claims` — company, claimant identity, claimant stakeholder link (nullable), security type, claimed quantity, holding route, as-of date, status, submitted/reviewed metadata, reviewer note, verified quantity.
- `ct_claim_invites` — company, email, hashed token, expiry, used/revoked state.
- `ct_claim_documents` — metadata rows pointing at a private storage bucket.
- `ct_issuers` — registry of claiming entities, with type and company scope.
- `ct_activity_cases` + `ct_case_notes` — unauthorised-activity cases and their history.

Access:
- Token submission goes through a public server route under `src/routes/api/public/` that validates the hashed token, rate-limits, and writes with a narrow service path — never a broad anon policy on the claim tables.
- Signed-in claimant reads use an RLS predicate similar to the existing `ct_is_holder` helper, scoped to their own claims only.
- Company-side reads and all review actions use `ct_can_manage` / `ct_can_view`, matching the rest of the cap table.

New files: `src/lib/captable-exposure.functions.ts`, `src/components/captable/exposure-view.tsx`, `src/components/captable/cases-view.tsx`, a public claim-submission route, and the corresponding routes under `client.cap-table.*`. Navigation gains Exposure and Cases entries.
