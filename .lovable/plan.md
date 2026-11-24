# Joint and entity investors: every party visible, connected and verified once

## What I found on the Girardi trust
- **Joe's ID check:** approved and AML-clear on his own person record, with his birthday on file. But his role on the trust still says "Not started." The trust's checklist reads that role status rather than Joe's own result, so it still shows Joe as pending.
- **Trust EIN:** on file (ending 1123). Joe is now the W-9 signer and a co-signer.
- **Joe's login:** he has no login, no ID card upload and no personal SSN on file. Kim has a login and an approved check.
- **Same gap elsewhere:** any owner or signer verified outside the main investor's own login can look unverified on the investment.

## What I'll build

### 1. Pull Joe's KYC onto the trust (and do the same automatically for everyone)
- A trust or company role (owner, signer, trustee, control person) takes its ID and AML result from that person's own record whenever the person is approved, or when their check changes. The checklist then refreshes.
- Run a one-time catch-up across all funds for roles showing "Not started" while the person is already approved. Joe's role becomes "Approved."
- Only approved results carry over. Pending, failed or in-review checks never count as done.

### 2. One "Parties on this investment" view
On the investor page (staff and that fund's managers), each person gets a row showing:
- name, role and ownership %, signer and W-9 signer badges
- email and whether they have a login (Invited / Signed in / No login)
- what they can access: investor, helper, signer only, or view only
- ID check, AML, SSN (on file / last 4) and ID card status
- documents they signed or still need to sign
- recent activity: invite sent, opened, sign-in, signed, ID check done (recorded events only, never "online now")
- one next action button, for example "Send sign-up invite", "Send ID check" or "Send signing link"

### 3. Smooth path for a co-owner like Joe
- **Send sign-up invite:** an exact-person invitation for owners and signers. The account links to his person record, so he sees the trust investment as signer-only. That means his own tasks: ID, his SSN and W-9 for the trust, and documents to sign. He gets no investor authority or money actions.
- **Documents to sign:** the Subscription Agreement goes to both signers on the same copy (already built). Side letters and the W-9 go to the signer chosen for each one, with a no-login link if he hasn't signed up yet.
- **Investor tasks:** Kim's home page and notifications show what's waiting on Joe, as "Waiting on Joseph Girardi."

### 4. Standard rules for future entities and joint trusts
- Adding an owner or signer with an email offers the invite right away.
- Every signer signs the same copy of investor-signed documents.
- One W-9 signer per entity, who must be a signer.
- Each person's verification lives on the person and reuses across investments and funds.
- The entity requirements list counts each person's own results, so nothing gets entered twice.

## Questions settled by default (tell me if different)
- Joe's sign-up gives signer-only access, not full investor access.
- Kim also signs the side letter, as a joint signer, unless you say Joe alone.

## Technical details
- Add a verification sync (server helper plus trigger on person KYC/AML status) that sets `investment_profile_relationships.verification_status` from `persons.kyc_status`/`aml_status` only on approval, logs to `investor_record_changes`, and calls `reconcileAfter`. Run the backfill through `supabase--run_sql`.
- The parties projection extends `investor-record.server.ts` related rows with login state, `onboarding_participants` access, signature rows from `document_signature_signers`, and events from the existing activity timeline reader.
- The co-owner invite reuses the `fund_invitations` and `connectEmail` path with `invite_role` set to signer and a link to the person record. Access stays scoped to that onboarding through the existing fund access checks.
- Signer choice for side letters and the W-9 extends `fund-file-signing` order selection to specific relationship signers. The W-9 uses `is_tax_form_signer`.
- Tests: an approved person carries over, a pending one doesn't, signer-only access can't open money or approval actions, and multiple signers all end up on the same signing request.
