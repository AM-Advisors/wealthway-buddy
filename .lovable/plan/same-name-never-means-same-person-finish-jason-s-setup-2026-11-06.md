# Same name never means same person; finish Jason's setup

## Rule
- Two accounts with the same name are treated as **different people** by default. A name never links, merges or approves anything across accounts.
- The new identity pass checks only that account's own ID against its own legal name. It never compares names with other people.
- The staff-only "Possibly the same verified person" note appears only when two identity checks share the **same date of birth and the same ID number (last 4 digits)**, and both checks passed liveness and face match. A matching name alone never shows it. Even when it shows, the accounts stay separate.

## What gets built
1. **Staff-only same-person note** on Investor 360 and the identity review. It shows "Possibly the same verified person as <other account>" with a link, and only staff can see it. Nothing is merged or shared.
2. **"Use ID name" button** for staff. It shows when the name on the ID differs from the person's recorded legal name. One click saves the ID name through the existing investor-record review, with a logged change.
3. **Remove the "Jon Dang" test entry** (jason@harmonious+roastest.co). It has no login. It is hidden from Erebor and ROAS counts using the existing removal path, and its history is kept.

## Technical details
- `person-identity-model.ts`: add `samePersonCandidate(a, b)`, which requires an equal DOB, an equal ID last-4 and both liveness and face match to pass. It ignores the name entirely.
- `account-kyc.server.ts`: add a staff-only reader that lists other checks matching on DOB + last-4. No new table: it's computed from `review_details` on read, so nothing is stored that could link accounts.
- UI: add the note to the identity review card and Investor 360's Identity checks section. Add the "Use ID name" action to the investor record's Details section.
- Tests: a same name with a different DOB is not a candidate; the same DOB + last-4 is a candidate; a failed liveness is not a candidate.
- Memory: same name means different people; only DOB + ID number suggests a match, and staff review it without merging.
