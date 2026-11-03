# Stop false "under review" holds on passed identity checks

## What is actually stopping Christofer
- His identity check passed every part on the verification service, including background screening.
- The screening returned two name look-alikes, "Christopher Michael Parr" and "Christopher Michael Garry". The service had already marked both as **not a match / false positive**.
- Our rule counts every look-alike as a possible match, no matter what the service decided. So his screening was set to "under review" on his investor record.
- Because screening shows "under review", his investment won't reuse the passed check. It keeps asking him to verify again, which pauses him on Verification.

## The fix
1. **Respect the service's own result for look-alikes.** If the service marks a look-alike as not a match or a false positive, it doesn't count. Screening is approved automatically when no real possible match is left.
2. **Only real concerns go to review.** A possible match the service hasn't ruled out still goes to review. So do sanctions, politically exposed person or enforcement matches, and declined or expired IDs. Those are the cases that could stop someone investing in private markets.
3. **Apply the same rule everywhere.** Use it for the login check, the investment check and the automatic reuse of a prior check, so no screen disagrees.
4. **Fix Christofer now.** Re-read his passed check from the service, apply the corrected rule and reuse it on his Erebor investment. He moves to Sign without verifying again. The old unused investment check is closed, not deleted.
5. **Sweep for others stuck the same way.** Re-check every investor whose screening is "under review" only because of look-alikes the service already cleared. Clear those automatically and leave real reviews alone.
6. **Keep the record.** Each automatic clearance is logged with the reason "look-alike names ruled out by the screening service", and the original results stay on file. Staff can still see the look-alikes in the review detail.

## What stays the same
- Signatures, accreditation, manager approval and funding gates are unchanged.
- Human decisions already recorded are never overwritten.

## Technical details
- `didit-auto-apply.server.ts` `extractDiditDetails`: exclude hits where `match === false`, or where `review_status` / `is_false_positive` marks a false positive, from `amlHits`/`amlStatus`. Keep the full hit list for review display.
- `kyc-verification.ts` `normalizeDiditDecision`: the `aml.hitCount` used by `applyAccountDecision` and investment decisions counts only unresolved hits.
- Add a shared pure helper in `aml-match-model.ts` (`unresolvedAmlHits`), with tests: a provider false positive clears, an unresolved hit goes to review, and a sanctions/PEP hit the service hasn't ruled out goes to review.
- One-off remediation: rerun `autoApplyDiditForOnboarding` for Christofer's onboarding, then `reconcileInvestmentReadiness`. Run a guarded sweep over persons with `aml_status = 'review'` and no human decision.
- Record the rule in `src/lib/AGENTS.md`.
