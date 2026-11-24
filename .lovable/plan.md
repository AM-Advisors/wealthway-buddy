# Add "Fill in for investor" to the investor page header

Put the same "Fill in for investor" button that's on the fund's investor list at the top of each investor's page, next to "Correct investor details". It's hidden once an investor is removed from the fund.

It opens the same fill-in window as the list, with the same permissions and saves. Nothing new is stored.

## Technical details
- In `src/components/investor-record-page.tsx`, import `FillForInvestorButton` from `@/components/fill-for-investor`.
- Render `<FillForInvestorButton onboardingId={onboardingId} name={data.overview.name} />` before the "Correct investor details" button when `!data.overview.removed`.
