# Investor journey: new profile wording, KYC/KYB details, deal room first, step back

## What changes for the investor
1. **Wording** - "Or add someone new" becomes **"Add new investment profile"** (and "Add who is investing" becomes the same when they have none).
2. **Right details for the type chosen** - the form only asks what's needed for that profile type, and only when it hasn't been verified before:
   - Individual / Joint / IRA: legal name, date of birth, home address, citizenship, SSN or tax ID, phone (joint: same for the second holder; IRA: custodian name and account).
   - LLC / Corporation / Partnership: legal entity name, formation state and date, EIN, business address, entity type, people who own 25%+ or control/sign (name, title, ownership %, DOB, address).
   - Trust: trust name, date formed, tax ID, trustees and grantor details.
   - A profile already verified shows "Verified - nothing more needed" with no form. Saved details are reused for every fund.
   - Full ID numbers are sent to the identity check provider only, never shown back; we keep last four digits.
3. **Deal room before step 1** - a new "Review the deal" step appears ahead of About You, with the asset, minimum, key terms, investor-visible fund documents and questions. "Continue to About You" moves on. Reviewing never commits them.
4. **Move backwards** - every completed or earlier step stays clickable, plus Back/Next buttons. Going back is read-only for anything signed, verified or funded; editable otherwise (same rules as today's pre-signing edits).
5. **All investor-visible fund documents** - the deal room and Sign step list every fund document marked for investors (memo, PPM, operating agreement, subscription preview, etc.), view-only. Staff/internal documents stay hidden.

## Boundaries
- The four official steps stay About You, Verification, Sign, Fund; the deal review is a preview, not a step that blocks anything.
- No change to who approves KYC/KYB; the identity provider stays the authority.
- Bank details and readiness stay hidden from investors.

## Technical details
- `investor-onboarding-journey.tsx`: rename copy; add a `review` pre-step rendering existing `DealReview` (by offering slug/id); remove the `locked` disable for prior steps, add Back/Next.
- New `ProfileDetailsForm` driven by a pure `kycFieldsFor(profileType, alreadyVerified)` in `identity-model.ts`; saves through existing profile/person/entity_verifications writers (`investment-profile-detail.server.ts`, `identity.server.ts`), owner-checked server-side; then reconcile readiness for linked investments.
- `deal-review.functions.ts`: accept onboarding/offering id as well as slug; list all `show_pre_commitment` + investor-visible fund documents.
- Tests: field set per profile type, verified profile requires no fields, internal documents never returned to investors.
