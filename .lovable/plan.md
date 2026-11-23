# Sign now link

A personal link that takes an investor straight to signing. Use it when a helper, fund manager or Harmonious has already prepared the investment and done the identity check, and only the investor's signature is left.

## What people will see

**Fund managers and Harmonious (investor record and Signatures list)**
- Each document waiting on the investor gets two buttons: **Email sign link** and **Copy sign link**.
- Email sends our branded email with one **Sign now** button. It uses the same 24-hour limit as reminders, and a Super Admin can override that with a reason.
- Copy gives a link you can paste into your own email or text.
- If someone has to finish something before signing, such as the identity check or the subscription amount, the buttons are greyed out and say what's missing.

**Investor**
1. They press **Sign now** in the email.
2. If they've never signed in, they set a password first, using the same personal invite we already send. Otherwise they just sign in.
3. They go straight to the Sign step of that investment. Steps someone else already finished are skipped.
4. One large **Open document to sign** button opens the full signing page in a new tab. That page never goes blank. One click is needed because browsers block tabs that open by themselves.
5. When they come back, the signature is checked and recorded automatically, and the document shows **Signed** for everyone.

## What stays protected
- The link is our own address, never the signing service's link. Holding the link alone can't sign anything: the investor still has to sign in as themselves.
- The identity check and the rule that the investor signs first still apply before the document opens.
- Email scanners that click the link only reach the sign-in page. Nothing is used up or marked as viewed.
- Completion only comes from the signing service's record, as it does now.
- Sending a link never changes the investment, the documents or anyone's access.

## Technical details
- Link format: `/investment/$onboardingId?sign=<offeringDocumentId>`. Add `sign` to that route's search validation, open the Sign step, and give DocumentSignCard an `autoStart` prop that shows the large button and opens in tab mode (it reuses the prefersNewTab, return-check and window_opened_at logic).
- New `src/lib/sign-link.ts` (pure): `signLinkPath()` plus `signLinkReadiness(facts)` → `{ ready, reason }` using the existing signing verification and subscription facts. Tests cover each blocking reason and the exact path.
- New `sendSignLinkFn` / `signLinkFn` in `src/lib/sign-link.functions.ts`: requireSupabaseAuth, staff or the exact fund's managers via assertFund, the investor's own onboarding and document only. Email goes through the existing `sendSigningReminder` (invite link plus `next`, reminder key `sign-link:<onboarding>:<doc>`, audit event). Copy returns the portal URL, and for an investor who has never signed in, their invite URL with `next`.
- UI: buttons in the existing Send to investor card on the investor record and in the Signatures row (beside Resend). No new page.
- Add a rule to `src/components/AGENTS.md`. Mirror the buttons in the QA sandbox signatures fixture.
