# Erebor subscription agreement and fees step fixes

## What we found

**1. Why the cover page looks off**
The current Erebor Subscription Agreement (version 4, `Erebor_Subscription_Agreement_100k`, approved Nov 3) is a Word file. When it goes out for signing, the signing service turns it into a PDF itself, and the navy title box on page 1 doesn't grow to fit two lines. So "SUBSCRIPTION AGREEMENT &" gets cut in half. The text is all there; only the layout breaks in that conversion.

**2. Where it lives**
- Staff and managers: Corps Erebor fund → Documents → Subscription Agreement (version 4 is current).
- Investors: their investment → Review & Sign → step 5, Subscription documents (opens the signing window shown in the photo).

**3. Why your name shows on the fees step**
When the carry was corrected from 15% to 20% on Oct 22, the note "Carried interest change from 15% to 20%, requested by Alyssa Pettit." was saved in the fund's fee terms notes. The investor fees step shows that notes box word for word, so an internal staff note is reaching investors.
The same box also shows the side letter as a raw file name instead of a plain title.

## Changes

1. **Fix the cover page**
   - Fix the title box in the Erebor Word file so the full title fits, then save it as a new version (version 5). Version 4 and any signed copies stay as they are.
   - Before sending any Word document for signing, turn it into a PDF on our side, so what investors sign matches what staff preview.
   - Unsigned Erebor signing requests get the corrected copy. Anything already signed stays the same.

2. **Stop internal fee notes from reaching investors**
   - Investors see only the fee figures. Internal notes stay on staff and manager screens.
   - Clear the "requested by Alyssa Pettit" wording from the investor view. The change history stays on record for staff.

3. **Plain side letter wording**
   - Show "Side letter · Active" (or the letter's title) instead of the file path, and hide side letters still in draft.

## Technical details
- `src/lib/investor-extras.server.ts` (fee status reader): stop returning `fund_fee_terms.notes` to investors; build side letter labels from title/status, omitting `proposed`.
- `src/components/investor-onboarding-extras.tsx`: remove notes rendering from `FeeAcceptanceCard`.
- Signing send path: convert DOCX to PDF before upload (reuse the existing document renderer), then pin the version.
- New offering document version through the existing upload/version engine with explicit activation; signed history untouched.
- Tests: investors never get fee notes; side letter label never contains a storage path.
