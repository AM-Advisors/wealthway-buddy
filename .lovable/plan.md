# MSA signing page: easier reading, download and send to a reviewer

Applies to the proposal/quote signing page (the MSA, Privacy Policy and Terms checkboxes) and the portal's first-login MSA page.

## What changes
1. **Read without staying open.** "Read" opens the MSA in a side panel that does not cover the signing form. They can close it any time; the checkbox and Sign button never depend on it being open. Same for Privacy Policy and Terms.
2. **Even spacing.** Name, Title, checkboxes and buttons line up with the same spacing as the text boxes. Long text (MSA, policies, first-login MSA sections) sits in a fixed-height box that scrolls, instead of stretching the page.
3. **Download a copy.** "Download PDF" button for the exact version being signed (MSA and each policy).
4. **Send to someone else.** "Send to someone" with two choices:
   - **Review only**: they get a read-only link and a PDF; signing stays with the current person.
   - **Sign instead of me**: reuses the existing "They should sign instead of me" handoff, so the original link stops working for signing.

## Unchanged
Signing still needs the checkbox, name and signature. Signed versions and history stay as recorded. One MSA per client.

## Technical details
- New shared `MsaReader` component (side sheet + scroll area) used by `accept.$token.tsx` and `msa-signing-panel.tsx`.
- PDF built in the browser from the pinned version sections (pdf-lib), filename with version.
- Review-only send: new token-scoped server function that emails a read-only link through the existing transactional email sender, logged on the agreement; no access or signing rights granted. Sign handoff calls existing `addAcceptanceTeammate`.
- Tests for: sign enabled without reader open; review-only link cannot sign.
