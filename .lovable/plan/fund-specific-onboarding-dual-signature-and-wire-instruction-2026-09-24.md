# Fund-specific onboarding: dual signature and wire instructions

Extends onboard.harmonious.co from 3 steps to 5 (Verification → Accreditation → Sign → Fund → Complete). It builds on the existing fund, offering, investment, Box, funding-instruction, bank-matching, reconciliation and Action Center records. No new parallel systems.

## What users will see

**Fund managers and Operations (Fund → Investors)**
- An "Investor Onboarding Settings" panel:
  - Verification and accreditation are shown read-only, taken from the offering.
  - Choose which documents investors must sign.
  - Pick a signing mode per document: Investor only, or Investor → Fund Manager.
  - Name the authorized countersigner(s).
  - Pick the current released wire-instruction version. Only masked account details are shown here.
- "Prepare for Signature" builds on the existing signature-block editor:
  - New field types: Printed Name, Entity Name, Text.
  - Every field is assigned to a signer: Investor or Fund Manager, shown in two colors.
  - Fields are prepared once per fund document, then copied to each investment.
  - Each copy is pinned to its template version, so later template edits never change documents already sent or signed.
- An investor table with these columns: Investor, Investing As, Amount, Verification, Accreditation, Documents, Funding, Action.
  - Clicking a row opens tabs: Overview, Onboarding, Documents, Funding, Activity.
  - Funding statuses: Not ready → Instructions available → Investor says sent → Payment detected → Reconciliation required → Funded. There is no manual "Funded" button.
- Countersigning:
  - After Box confirms the investor signed, the countersigner gets an Action Center item: "Signature required — [Investor] / [Fund]".
  - "Review & Countersign" shows only the document and the manager's own fields.
- Add Investor works from inside the fund, so the fund is filled in automatically. "Send Onboarding" sends the invitation.

**Investors (onboard.harmonious.co)**
- Sign: when a countersignature is needed, the investor sees "Waiting for Fund Manager signature" after signing. They never repeat a step.
- Fund: this step appears only after signing is done and the existing review/release gate has passed.
  - It shows the fund, the amount and who is investing.
  - "View Wire Instructions" asks the investor to confirm who they are again (no new KYC).
  - Then it shows the released instructions, with a copy button per field and a short-lived download.
  - The wire-fraud warning is always shown.
  - "I've Sent My Wire" is for information only. It shows "Waiting for funds to be received and reconciled."
- Complete: each item gets a tick only when the official record confirms it. "Funding received" appears only after reconciliation and posted accounting.

## Technical details
- **Configuration.** Stored per offering. Reuses these tables:
  - `offering_documents` and `offering_document_signature_blocks`: adds `signer_role`, the new block types and `template_version`.
  - `funding_instruction_versions`: holds the released version.
  - A small signing-mode/countersigner column set on the offering document.
- **Countersigner authority.** Checked on the server against current assignments (`fund_managers` or the capability resolver), never against a role label.
- **Dual signature on Box.** Uses an ordered two-signer request.
  - The existing `document_signatures` and `document_signature_signers` rows track status: prepared → sent → investor signed → awaiting manager → manager signed → fully executed.
  - The Box webhook handles completed, declined, cancelled, expired, replaced and resent. Repeated webhook calls have no extra effect.
  - A document is fully executed only when every required signer is confirmed. The executed copy cannot be changed and records its template version.
- **Wire reveal.** Reuses the existing step-up records (`register_stepup_attempt` / `consume_signing_stepup` pattern) with a wire purpose.
  - Short-lived, and tied to the user, the investment and the instruction version.
  - Every reveal is logged. A superseded version is refused. No URL parameter can skip the check.
- **Funding status.** Derived from `expected_fundings` → `funding_matches` → reconciliation → posted journal entries. No new status is stored.
- **Tests.** Adds every security case in section 22 of the spec, plus pure-model tests for sequencing, resume order and the funding projection.
- **Checks at the end.** Full test run, typecheck, production build, plus desktop and phone browser checks where accounts allow.
- **Out of scope.** Outbound distributions, providers or money movement, and any redesign of the main portal.
