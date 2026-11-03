# One identity check per person

## The problem today
- A person verifies when they create their login, and the investment's Verification step can then ask them to verify again.
- Christofer hit this. His login check was still being looked at when he started his Erebor investment, so the investment opened a second, separate check. He then saw two different statuses and was asked to repeat work he had already done.

## What changes
1. **One identity check per person.** The check done at login is that person's identity check. Any investment they make as themselves (an individual investment) uses it. No second check is ever started for the same person.
2. **Verification follows the login check.**
   - If it passed, Verification is complete automatically and the investor goes straight to Sign.
   - If it's still being looked at, Verification shows the same status as the login check ("Your identity check is being finished, nothing more to do"), with no new link.
   - If it was sent back or expired, the single recovery link reopens that same check, and every investment updates from it.
3. **New profiles keep their own step, only for what's new.** When someone invests through a trust, company or other new entity, they don't redo their own ID. The only thing asked is the entity's own verification (business documents and owners). Other new owners or signers still verify themselves once, using the same one-check-per-person rule.
4. **Same status everywhere.** The investor, the fund manager and Harmonious staff all see the one person-level result. That covers the investor page, manager roster, Investor 360, the stalled-items page and the BSA profile.
5. **Clean up existing duplicates.** For people who already have both a login check and an unused investment check, the investment is pointed at the login check. The unused one is closed as "replaced by the person's identity check" and kept on file, not deleted. Christofer is included.

## What stays the same
- Background screening, review decisions, verification safeguards and the expiry date for re-verifying.
- Signatures, accreditation, manager approval and funding gates.
- Past results and recorded human decisions are never rewritten.

## Technical details
- Add a single entry point, `ensurePersonIdentityCheck(personId)`, in `kyc-verification.server.ts`. It resolves the person's current check (approved or in-flight account check, else an approved prior investment check). It only creates a session when none exists.
- `startInvestmentVerification` and `startIdentityCheck` call it. Individual profiles never call `startVerificationSession` for a person who already has an in-flight check. Entity profiles route only KYB through the existing entity verification path.
- `identityVerificationProgress` and the readiness projection read the person-level status (account check plus person `kyc_status`/`aml_status`) instead of only the application's `kyc_verifications` row.
- The webhook decision for an account check fans out to the person's open investments through the existing `autoApplyDiditForOnboarding` plus `reconcileReadinessForSubjects`.
- Data sweep: for open investments with an unstarted `kyc_verifications` session and a same-person account check, mark the investment check superseded (new status plus an event, no delete) and link it to the account check.
- Tests:
  - An individual investment with an approved login check starts no session.
  - With an in-review login check, the investment shows that check's status and no new link.
  - An entity investment asks for KYB only.
  - A sent-back check reuses one recovery link.
- Record the rule in `src/lib/AGENTS.md`.
