# Let one person keep separate accounts for separate investments

## What's happening with Jason Dang

Jason has three records:

- **jason@harmonious.co**: his login, identity already approved.
- **jasonrdang@gmail.com**: a new login created today. Its identity check is stuck in **Under review**.
- **Jon Dang (jason@harmonious+roastest.co)**: a test entry with no login.

The new check stalled because the identity service marked it for review: "same face as another approved person" and "possible duplicate user." That other person is Jason himself on his harmonious.co account. The account also expected the name **"Josh Dang"**, but his license says **Jason Robert M K Dang**, so it added a name mismatch warning. Liveness, face match and address all passed.

Nothing in the platform joins accounts that share an ID. The stall comes from the service treating a second account as suspicious.

## What changes

1. **Same person, separate accounts is allowed.** If the only warnings are that the person matches another approved check (same face, same ID, same IP), and the name and birthday on both IDs match, the check counts as a clean pass. The accounts stay separate: no merge, no shared funds, no shared documents.
2. **Staff see the link privately.** Investor 360 and the identity review show staff-only "Same verified person as another account" with a link. Investors and fund managers never see the other account.
3. **Real problems still go to review.** A different name or birthday on the ID, a failed liveness or face match, or an ID the service flags as fake still stops for review.
4. **Name mismatch.** If the name typed at sign-up differs from the ID, the ID name becomes the verified name, following the existing verified-name rule. Staff confirm it in one click. "Josh" vs "Jason" is the case here.
5. **Fix Jason now.** Re-check his pending gmail check under the new rule so it passes and his investments move forward. Ask before removing the "Jon Dang" test entry.

Never automatic: merging accounts, sharing records between accounts, or bypassing screening (AML) matches.

## Technical details

- `person-identity-model.ts`: add `classifySelfDuplicateWarnings(review, priorApprovedChecks)`. The duplicate-family warnings are "Possible duplicated user", "Duplicated face from other approved session", "Selfie ... may match an approved user" and "Duplicated IP address". They count as benign only when a prior approved check has the same normalized full name, DOB and ID last-4.
- Decision path (didit webhook + `person-identity.server.ts`): when every non-pass item is benign, record an `approved` decision with note "Same verified person on another account; accounts kept separate," using the existing decision event trail. Never rewrite provider evidence.
- Store the relationship in a new append-only `identity_same_person_links` table (check_id, other_check_id, created_at). Staff-only RLS, no person merge. Show it in the identity review and Investor 360.
- Name mismatch: reuse the verified-name display. Add a staff "Use ID name" action that updates the person's legal name through investor-record save/review.
- Tests: benign duplicate passes; DOB/name difference stays in review; liveness fail stays in review; no merge or cross-account read happens.
- Update the tin-auto-connect memory: identical IDs never auto-merge; separate accounts stay separate.
