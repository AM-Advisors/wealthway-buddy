# Show KYC/AML status on a client's People list

## What you'll see

On a client's page, under **People**, each person gets two small badges:

- **KYC:** Approved / In review / Declined / Not started
- **AML:** Approved / In review / Declined / Not started

The status comes from the person's verification record (the same Didit-driven record used everywhere else), matched by their login account or email. People with no verification record show "Not started" — nothing is inferred or guessed.

## Changes

1. **`src/lib/client-admin.functions.ts` — `listClientPeople`**
   - After loading the client's people, look up their verification records from the `persons` table by `user_id` (falling back to email for people without a login).
   - Return `kycStatus` and `amlStatus` per person. No new tables or migrations — the columns already exist (`persons.kyc_status`, `persons.aml_status`).

2. **`src/components/client-admin.tsx` — `ClientPeoplePanel`**
   - Render the two badges next to each person's name/roles, using the same status wording and colors used elsewhere for KYC/AML.

## Notes

- Read-only display: no verification data is changed, and no new authority is granted. The panel already sits behind the existing staff/client permission check.
- The separate "relationship people" list (investors, delegates) keeps its current rule of not exposing KYC/AML details; this change covers the staff-facing People panel only.
