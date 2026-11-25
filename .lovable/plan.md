# Lock the trust tax ID choice once saved

## What changes
- After a trust's tax ID is saved, the "Trust uses" choice (Trustee's SSN or Separate trust EIN) locks. It shows as plain text, for example "Trust uses: Separate trust EIN · Locked", with no dropdown.
- The number box stays available to fix a typo in the same type of number, with a "Replace" button.
- Fixes today's confusing screen: the box said "On file (EIN)" while the dropdown showed "Trustee's SSN". The locked view always shows what is actually saved.
- To switch types later, Harmonious staff use a small "Change tax ID type" link. It asks for confirmation and a reason, clears the old number, and logs the change on the investment's activity. Managers and investors cannot switch it.
- Applies to the investor record page and the profile page, which both have this box.

## Technical details
- `InvestorTaxIdCard` (src/components/investor-record-extras.tsx) and the profile route: when `last4 && taxIdType` exist, render read-only type and hide the select; staff-only unlock path.
- Server (`updateInvestorRecordFn`): reject a `taxIdType` different from the saved one unless a staff caller sends an explicit `changeTaxIdType` flag plus a reason; record an investor_onboarding_events entry. Server authority stays the real lock.
- Small test: a saved type cannot be changed without the staff flag; the same-type replacement still works.
