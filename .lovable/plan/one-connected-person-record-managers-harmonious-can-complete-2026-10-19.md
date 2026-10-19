# One connected person record + managers/Harmonious can complete investor details

## What the data shows today
- There is already one shared people list (267 people). Every investment is linked to a person.
- Gaps found:
  - 3 email addresses are each shared by 2 people (6 records). None match on name too, so none count as exact duplicates.
  - 4 people have a sign-in account with the same email but aren't connected to it.
  - 3 client contacts and 2 investment profiles aren't connected to any person.
  - Manager-added investors (Calvin, Edward) only connect to an account when they claim their link.

## 1. Connect everything to one person
- **Exact matches merge automatically:** same email and same legal name (and date of birth when both have one). The surviving record keeps every investment, profile, contact, document, identity check and history. The other is marked "merged into" and kept read-only, never deleted. Each merge is logged.
- **Everything else is flagged, not merged:** same email but different names, such as couples sharing an inbox. These go to a "Possible duplicates" list in People & Access, where Harmonious can merge or mark them "not the same person".
- **Accounts connect automatically:** when someone signs up or signs in with an email that matches exactly one person who has no account, they're linked. This fixes the 4 unconnected people now and handles Calvin and Edward when they sign up. If more than one person matches, it's flagged instead.
- **Fill the remaining gaps:** connect the 3 contacts and 2 profiles to their person, using the same exact-match rule. Anything unclear is flagged.
- **One source of facts:** name, contact details, address, date of birth and tax status are read from the person everywhere: fund investor pages, client contacts and People & Access. A change in one place shows everywhere, with no second copy to drift.

## 2. Managers and Harmonious can complete all investor details
On the investor's page, a new **Complete details** form covers:
- person: legal name, date of birth, email, phone, address, citizenship
- profile: type, entity/trust/IRA details, signers and owners, accreditation tier
- tax: tax classification; full tax numbers are stored encrypted and only the last four are shown
- banking for distributions
- **documents:** upload ID, entity, trust and accreditation documents for the investor. Originals are kept, and re-uploads add a new version.

Rules:
- Before the investor signs or funds, edits save directly. After signing or funding, edits need Harmonious approval (unchanged).
- Managers can only edit investors in their own funds. Information shared by other funds changes only through Harmonious.
- An uploaded ID or document doesn't mark anyone verified. Identity checks still run through Didit, and investors still sign for themselves.
- Every change is recorded in the investor's Record history with who made it.

## Unchanged
Nothing is deleted. Approvals for money, filings and identity stay as they are.

## Technical notes
- Migration: `persons.merged_into_person_id`, `merged_at`, `merged_by`; `person_merge_events` (immutable) and `person_duplicate_flags` (status open/merged/dismissed); GRANT + RLS (staff read via has_role). Trigger blocks writes to merged persons.
- `person-merge.server.ts`: repoint person_id FKs (investor_onboardings, investment_profiles, client_contacts, person_kyc_requests, kyc_verifications, investor_documents, etc. — enumerate via information_schema) in one transaction function `merge_persons(_keep, _drop, _actor)` (security definer, service_role only).
- Exact-match sweep runs once now and on each person create/update; account linking runs in the existing sign-in/claim path through person-resolution.server.ts (single candidate only).
- Manager form reuses the pre-signing manager edit window and investor_record_changes logging; documents go through investor_documents with investment_profile_id; tax numbers use existing encrypted storage.
- Tests: exact-match rule, ambiguous email → flag, merged person read-only, manager outside fund refused, post-signing edit → approval request, upload never sets verified.
