# Texas Capital account setup workflow

## What you'll get

A "Texas Capital account" request on each client/fund. It fills in the three Texas Capital forms with details already saved on the account. Someone checks the package, an authorized approver approves it, and then it goes to the Texas Capital team by secure link.

## Steps in the workflow

1. **Start.** Open the fund or client entity, choose "Open Texas Capital account" and pick the entity type (LLC or corporation).
2. **Prefill.** The platform fills in the forms from records you already have: legal name, entity type, EIN, DBA, addresses, phone, website, formation date and state, NAICS/business description, signers, controlling party and beneficial owners (from the BSA profile and verification records). Only blank fields are asked for, and nothing already verified gets retyped.
3. **Account details (preset, editable):** 1 account, Checking, added to the existing BankNow portal: Yes.
4. **Documents checklist** (reuses uploads already on file):
  - LLC: Operating/Company Agreement, Certificate of Formation, Certificate of Filing, EIN letter/W-9/SS-4, Assumed Name Certificate + W-9 showing DBA (only if there's a DBA).
  - Corporation: Certificate of Incorporation or Certificate of Filing, executed Bylaws.
  - ID: required only for **new** signers, the controlling party and beneficial owners not already on file with Texas Capital. If the only signer is already on file, no ID is needed.
5. **Generate forms:** Customer BSA Profile (the fillable form, filled in), Customer Account BSA Profile, and Certification of Beneficial Ownership. Each new signer gets their own signer page. Forms that need a wet or e-signature get marked "signature required".
6. **Approve.** Any authorized approver (staff or the fund manager) approves, but never the person who prepared the package. You can undo before sending.
7. **Send.** One email goes to Jeannie.Anguiano@, Ginger.Lanman@, elliott.bouillion@ and [MiddleMarketClientService@texascapital.com](mailto:MiddleMarketClientService@texascapital.com). CC [operations@harmonious.co](mailto:operations@harmonious.co). It has a private download link that expires, with no attachments. Each open is logged.
8. **Track.** Statuses run Draft, Ready for review, Approved, Sent, Opened, Account opened. Stuck items show up on the existing stalled-work views.

## Safeguards

- No bank details, account numbers or money movement are created. Recording the account once it's open uses the existing bank-account approval path.
- Social Security numbers and IDs never appear in the email body or the logs. The link only works for that package and expires after 14 days, and it can be revoked or sent again.
- Texas Capital's name appears only on this bank-specific workflow and forms, which is needed because they're the recipient. Other screens stay neutral.

## Technical section

- Reuse the `bank_setup_packets` / `bank_application_events` tables (append-only events). Add a migration only for missing columns (bank code, entity type, account options, recipients, token hash, expiry).
- Prefill mapper in `src/lib/texas-capital-packet-model.ts` (pure + tests) reads client_entities, bsa_profiles/beneficial owners, formation evidence, verified identity.
- Fill the AcroForm BSA profile with pdf-lib. The two flat forms get overlay text at mapped coordinates. Merged PDF goes to a private storage bucket.
- Approval uses the existing approval engine and maker-checker rules. Sending uses the Lovable email transactional template. Public download route `/api/public/bank-packet/$token` checks the token hash and expiry and writes an open event.
- Tests cover document requirements per entity type, the rule that ID is needed only for new signers, the no-self-approval rule, the recipient list, and token expiry.