# Separate agreement checkboxes on quotes, and short email links

## What changes

**1. Three separate checkboxes on Sign & approve**
On the quote, proposal, RFP and RFQ signing page, the single agreement box becomes three:
- Master Service Agreement (shown only when this client still needs to sign the current version, as today)
- Privacy Policy
- Terms & Conditions

Each one opens its full text in a pop-up. The signer must tick every box shown before "Sign and approve" works.

**2. Only ask for what's still needed**
- The page checks which platform documents this signer has already accepted (the same records used at sign-in). If they've already accepted the current Privacy Policy or Terms, that box shows as "Already accepted on [date]" instead of asking again.
- When they sign, each newly accepted document is recorded against their account and the client, with date, typed name and version, the same way sign-in acceptance works. That means they won't be asked again at their first sign-in.
- The client's record (and the quote's history) shows which documents were accepted, by whom, and when.

**3. Shorter link in the email**
- The long link in "Please click here to open your quote" becomes a short one, like `harmonious.co/q/7Kx9Pa2`.
- The short link points to the same personal link. It still belongs to one person and one approved version, and it still shows "A newer version is available" when a newer version exists. Opening it is still tracked.

## What stays the same
Signing rules, MSA signed once per version, the SOW and invoice created on signing, who can sign, and the email wording.

## Technical details
- `accept.$token.tsx`: replace the single `agree` with `msaAgree`, `privacyAgree`, `termsAgree`; text comes from `legal-content.ts` so it matches /privacy and /terms.
- Acceptance read returns current `policy_documents` versions for privacy/terms plus the signer's existing `policy_acceptances` (matched by verified signer email to their profile when one exists).
- Sign server function validates the required flags server-side and inserts `policy_acceptances` rows (and a `policy_accepted` quote/document event) for documents not already accepted; for signers without an account yet, the acceptance is stored on the event and copied to `policy_acceptances` when their portal access is created.
- Short links: new table `short_links(code, target_token, created_at)` with RLS (service role only); `acceptLinkFor` returns `/q/<code>`; new public route `src/routes/q.$code.tsx` resolves and redirects to `/accept/<token>`. Codes are random 8 characters, never guessable from the record.
- Tests: required checkboxes enforced server-side; already-accepted policies are skipped; short code resolves to the original token.
