# Sign without signing in

Make the Sign now email work like DocuSign or Adobe Sign. The investor presses **Sign now**, sees the document and signs it, with no account, password or authenticator code.

## What changes for people

**Fund managers and Harmonious**
- **Email sign link** on the Signatures list sends the no-sign-in link. Copy sign link copies it.
- Each link belongs to one investor, one document and that investor's recorded email.
- The link lasts 14 days, stops working once the document is signed, and is replaced when a new one is sent. A **Cancel link** button turns it off at once.
- The Signatures list shows when the link was sent and when it was opened, using recorded evidence only.

**Investor**
1. They press **Sign now** in the email. A Harmonious page opens with the fund name, the document title and one button: **Review and sign**.
2. Pressing it opens the full signing page, never the window that can go blank. They sign there.
3. After signing they see "Signed. Thank you." The document shows Signed on the platform for everyone, as it does today.
4. Later, if they create an account with the same email, the signed copy is already on their investment.

## What stays protected
- **The identity check still comes first.** A link can only be sent after the investor's identity check is finished, whether they did it themselves or a helper or manager entered it. The check runs again when they press Review and sign.
- **Email scanners can't use it up.** Opening the link only shows the page. The signing session starts only when someone presses the button, the same fix as the "This wasn't me" link.
- **The link shows only that one document.** No investment details, other documents, bank or tax information, and it's never the signing service's own address.
- **Only the signing service's record counts as a signature.** Every open and signing is logged on the investment.
- Fund managers countersign the same way as today. Admission still needs the manager's approval.

## A rule this changes
Your saved rule says signing needs the investor's verified account. With this plan, the identity check is the safeguard instead. If you approve, I'll update that rule.

## Technical details
- Migration: `signing_access_links` table holding the hash of a 256-bit token, onboarding_id, offering_document_id, signer_email, expires_at, revoked_at, used_at, opened_at, created_by. Service-role only, with GRANTs, RLS on and no client policies. A unique active link per (onboarding, document), and a new send revokes the old one.
- Pure `src/lib/signing-access-link.ts`: `linkState(row, now)` returns active, expired, revoked or used, plus `canIssueLink(facts)` (identity verified, investor signer, not signed, email present). Tests use concrete expiry and revocation cases.
- Public routes under `src/routes/api/public/sign/`: GET `$token` renders a confirmation page with no document data beyond the title. POST verifies the token and state, re-runs the signing verification for the application, opens a provider session through a signer-row variant of `openSigningSession` keyed by onboarding and signer email (no userId), marks opened_at and 303-redirects to the full signer URL. Box `redirect_url` points to a `/signed` thank-you page.
- `sendSignLinkFn` / `signLinkFn` issue these links instead of the sign-in path and keep the existing Email, Copy and 24-hour limit. Add `revokeSignLinkFn`. Webhook completion sets used_at.
- Update `src/lib/AGENTS.md`, memory `pre-account-subscription-emails`, and add tests for the routes' token and state checks.
