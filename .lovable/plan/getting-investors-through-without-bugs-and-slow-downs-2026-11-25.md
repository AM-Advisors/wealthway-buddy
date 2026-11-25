# Getting investors through without bugs and slow-downs

## What the records show today
- 272 investments sit at the very first step (investor type chosen), 191 of them untouched for 7+ days. This is by far the biggest drop-off.
- 34 funded, 9 closed/complete. Only a handful sit in the middle steps (verification, signing, review, awaiting funds).

## What stopped investors recently (from the Larry, Kim and Joe cases)
1. **Duplicate people.** The same person saved twice (Larry), so details and checks landed on the wrong copy.
2. **Wrong investor type.** A trust saved as "other entity", which asked for the wrong things.
3. **Tax ID confusion.** Trust EIN vs trustee SSN unclear; SSN saved on the wrong person; type could flip after saving.
4. **Checks asked twice or wrongly.** Trusts on a trustee SSN asked for a business check; trusts asked for every trustee to be verified; uploaded accreditation proof never marked "under review".
5. **Hidden open items.** "1 required item left" with nothing visible to fix.
6. **Helper access.** Joe, a trustee, landed on a view-only page and couldn't move forward.
7. **Documents not switched on.** The offering circular was approved but never turned on, so investors never saw it.
8. **Wrong numbers shown.** Fund default fees shown instead of the signed side letter.
9. **Signing unavailable.** Missing trustee details in the signing paperwork blocked Kimberly.
10. **Money vs paperwork mismatch.** Wire arrived and screens said "complete" while paperwork was still open.

Most of these were fixed one at a time. The plan below removes the causes so they don't come back.

## Proposed changes

### 1. Bring back the 272 stalled investors
- A "Stalled at first step" list for managers, per fund, with one button: **Send reminder** (uses the existing invitation sender, no bulk blast without confirmation).
- Investor first screen trimmed to one question: "Who is investing?" (Myself, Trust, Company, IRA), then straight into their checklist.

### 2. One record per person, always
- Before saving a new person on an investment, check same email/name on that fund and offer "Use existing person" (never auto-merge).
- Staff "Possible duplicates" list for review.

### 3. Trust and company questions in plain Yes/No
- "Does your trust have its own EIN?" Yes / No, instead of a dropdown. Answer locks once saved (staff-only change, already built).
- Investor type change (e.g. "other entity" to trust) allowed for staff before signing, with a logged reason.

### 4. Each person fills in their own details
- Trustees and owners add their own SSN, birthday, address, phone and citizenship from their own login, so no one needs another person's private details.

### 5. One "What's left" checklist per person
- Every open item shows by name with its fix right next to it ("Joe: add phone"). No hidden counts.
- The same checklist drives the investor screen, the manager screen and the signing check, so "Signing unavailable" can only happen with a visible reason and fix.

### 6. Readiness check before anything is sent
- Before a signing request goes out, a "Ready to sign?" check lists anything missing (signer details, active documents, fees/side letter, tax form). Fix inline, then send.
- Fund-level check: approved documents that aren't switched on for investors show as a warning on the fund.

### 7. Fewer prompts
- Remove repeat confirmation pop-ups on routine saves; keep one confirmation only for signing, money, identity and access.
- Auto-advance after each step finishes (already done for Verification; extend to About you and Tax).

### 8. Ongoing health view for staff
- A small "Why stuck" summary on Ops: count of investors by blocking reason (missing detail, check pending, document not active, waiting on signer, waiting on manager). Display only, no new approvals.

## What stays the same
Signing order, manager approval and countersign, ID and background checks, money movement, signed history, and access rules. Nothing published; sandbox validated, production verification pending.

## Suggested order
1, 5, 6 first (biggest impact), then 4, 3, 2, 7, 8.

## Technical notes
- Stall list reads `investor_onboardings.stage` + `updated_at`; reminders reuse investor-progress-email drain.
- Checklist: extend `entity-investor-requirements.ts` as the single source; signing preflight in `prepared-investor.server.ts` consumes it.
- Duplicate check reuses cross-source contact matching; no merges without staff confirmation.
- Inactive-document warning reads existing fund document activation state.
- Tests for each rule next to existing `src/lib/*.test.ts`.
