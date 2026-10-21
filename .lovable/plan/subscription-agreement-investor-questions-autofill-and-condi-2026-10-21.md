# Subscription Agreement investor questions: autofill and conditional upload

## What changes for the investor

1. **Filled in automatically and locked** (investors can see these but can't edit them):
  - Name of Subscriber: the verified legal name from Verification (or the entity name for business profiles).
  - Subscription Amount: the commitment amount on the investment.
  - Email and Phone: the details already on the investor's profile or account.
  - For Persons/Individuals and Business Type: set from the verified profile type (individual leads to Single Individual; LLC, LP, Corporation, Trust and IRA map to the matching options). Joint, tenants-in-common and community property can't be worked out from verification, so the investor still picks one of those for joint profiles.
  - Which IRS form applies: set from verification. A U.S. person gets W-9, a non-U.S. individual gets W-8BEN, and a non-U.S. entity gets W-8BEN-E.
2. **The chosen IRS form becomes a document to sign.** It shows up in the Sign step document list next to the Subscription Agreement, and the Sign step isn't complete until it's signed. This reuses the existing tax form signing.
3. **Question 16 (identity/formation documents)** only shows when the investor answers "No" to question 15 (Funding Bank in a FATF country / customer of the Funding Bank). It becomes a file upload instead of a text box: individuals upload an ID plus proof of address, and entities upload formation documents. The upload is required only when the question is shown. Check the verification first to see if it has already been provided.
4. Question 15 (FATF high-risk jurisdiction) stays as a Yes/No question, unchanged.

## Rules kept

- Locked values come from server records, and the server checks them again when the answers are submitted, so a changed value is rejected.
- If verification isn't complete yet, the locked fields show "Fills in after Verification" and can't be submitted.
- Uploaded files go to the investor's private documents with an audit history. An upload alone never counts as verification.
- No outside platform names in any wording.

## Technical details

- `standard-investor-questionnaire.json`: add `locked`/`source` metadata to the six fields, change the question 16 `type` to `file`, and add `showWhen: { anyOf: [{key: funding_bank_fatf, equals: "No"}, {key: customer_of_funding_bank, equals: "No"}] }`.
- `investor-onboarding.server.ts`: build server-side prefill values from the verified kyc_verifications name, the person/entity profile type and tax residency, the onboarding commitment cents, and the contact email/phone. Override any client-sent values for locked keys and enforce the conditional requirement.
- Questionnaire renderer: support `showWhen` and the `file` type through the existing investor upload path (private bucket), and store the document id in the answer.
- Sign step: add the IRS form chosen from verification to the required documents through TaxSignPanel.
- Tests: map profile type to business type, map tax residency to IRS form, keep the locked override, and show/require question 16 only after a "No" on question 2 or 3.