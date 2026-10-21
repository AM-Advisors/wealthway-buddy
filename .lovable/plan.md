# Fund documents: prefilled from earlier steps, investor signs first, manager decides after

## What changes for investors
- **Commitment amount**: the Subscription Agreement shows the amount the investor entered in About You (for Calvin, $500,000). Right now it uses the fund's minimum.
- **Tax classification**: comes from Verification, with the same routing as Question 9. A U.S. person or U.S.-formed business gets the W-9. A non-U.S. individual gets the W-8BEN, and a non-U.S. business gets the W-8BEN-E. Individual vs. business also comes from the verified profile. The investor cannot change these values.
- **Title**: shown and required only when the investor signs for a business. Individuals see no title line and no title field.
- **No waiting on the manager**: approved documents are always ready for the investor to sign. The "Waiting for your approval" gate and any notice about it are removed from the investor's path.

## What changes for fund managers
- The investor's agreement no longer goes to the fund signatory for a countersignature. Investor signing is the only signature on these documents.
- After the investor finishes all their documents, the manager sees the investment under Fund → Approvals → Documents with two choices: **Approve** or **Decline**. Decline requires a reason.
- Approve marks the document set as accepted for that investor. Decline pauses the investment, shows the reason to the investor, and tells Harmonious. The signed copies are never changed.
- The manager gets one notice when an investor finishes signing, not before.

## Unchanged
- Harmonious still confirms verification decisions, receipt of funds and bank checks. Funding still needs Harmonious to confirm the money arrived.
- Closed-fund gates, high-risk question review and the tax-form-first order stay as they are.
- Documents already signed keep their recorded history.

## Technical details
- `fund-doc-templates.server.ts`: drop "Subscription Amount" from fund-level values. Fill it per investor from `onboardings` commitment (with the same source `subscription-prefill.ts` uses), plus tax classification and entity/individual type from the verification-driven routing.
- `templateSigningConfig`: the Subscription Agreement has an investor signer only. Add `entity_name`/`title` fields only when the profile is an entity. Skip creating the fund-signatory request so no countersignature is sent.
- `investor-document-review.server.ts`: the signing gate no longer requires an approval decision. Manager decisions move to after completion (`approved` | `declined` with a required note). A decline creates a blocking onboarding exception and notifies Operations, using the existing once-only notice pattern. Decisions are recorded as new rows, never overwrites.
- `investor-document-review.tsx` / `manager-fund-reviews`: rows show "Signed – awaiting your decision" with Approve and Decline. The pre-sign Approve and Return buttons are removed.
- Tests: commitment goes into the amount field (not the fund minimum); there is no title field for individuals and a required title for entities; signing is allowed with no manager decision; no countersigner is created; a decline needs a reason and blocks funding.
