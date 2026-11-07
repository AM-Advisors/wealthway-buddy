# Show Investor 360 inside the fund's investor record

## Goal
Staff open an investor from a fund and see that person's full Investor 360 on the same page. Today the **Open Investor 360** button leaves the fund and opens a separate page, which splits up the information.

## What changes
- The **Open Investor 360** button is replaced by an **Investor 360** section in the existing "Jump to section" bar, alongside Overview, Details, Verification & actions, Documents, Activity and BSA.
- Choosing it shows the person's Investor 360 right there: identity and verification status, their other funds and investments, linked accounts, documents, and activity. You stay inside the fund, and the "← Fund" back link is unchanged.
- From inside that section, a click on another fund's investment opens that fund's investor record (in the same tab, never a new one).
- Only Harmonious staff see the section, the same people who see the button now. Fund managers see no change.
- The standalone Investor 360 page stays available from Operations → Investors, so existing links keep working.

## Not changing
Permissions, the data each viewer is allowed to see, and how records are saved.

## Technical details
- `src/components/ops-record.tsx`: add an `embedded` prop to `OpsRecordPage` (type "investor") that hides its own page header/back link and sticky nav offset, so it fits inside another page. It keeps the same staff-only server reads.
- `src/components/investor-record-page.tsx`: add a staff-only `"investor360"` entry to the section tabs. It renders `<OpsRecordPage type="investor" id={investorUserId} embedded />` and is lazy-mounted only when selected, so the fund record doesn't get slower. Remove the header button. If there's no linked login, show "No investor account linked yet".
- Check that every link inside the embedded view uses the router's same-tab navigation, with no `target="_blank"`.
- Check on screen at the user's narrow viewport (~520px) that the section works and nothing opens a new tab.
