# Hide bank details and readiness from investors

## Current state (checked)
- An investor's investment page shows a **Bank details** card with the fund's wire instructions from the start, whatever step the investor is on.
- The fund's deal room Overview also shows the wire details to any investor with a record in the fund.
- The **Fund** step already keeps wiring instructions behind "View Secure Wiring Instructions", and only once the investor is approved to fund. That stays the same.
- The investment page also shows investors an **Investment Readiness** checklist. The server returns it to the investor (shown from the investor's point of view).

## Changes
1. **Bank details only at the Fund step**
   - Remove the separate Bank details card from the investor's investment page.
   - In the deal room, the "Funding" box keeps showing the investor their commitment amount. Wire details are only included once the investor is approved to fund. The server makes this check, so the details are never sent to the browser earlier.
2. **Readiness for Harmonious and fund managers only**
   - Remove the Investment Readiness checklist from the investor's investment page, and from the "view as investor" preview so the preview matches.
   - The server refuses readiness requests from the investor themselves. Harmonious staff and the fund's managers still see it everywhere they do today.
   - Investors still see what they need to do through the four steps (About You, Verification, Sign, Fund).

## Unchanged
- How the Fund step works, wire matching, and every money safeguard.
- What staff and managers see for readiness and banking.

## Technical details
- `src/routes/_authenticated/investment.$onboardingId.tsx`: drop `OnboardingBankDetails` and `InvestmentChecklist`.
- `src/routes/_authenticated/view-as.tsx`: stop rendering `InvestmentChecklist` in the investor preview.
- `investmentReadiness` in `investor-onboarding.server.ts`: forbid when `access.role` is the investor.
- `getDiligenceRoom` in `diligence.functions.ts`: return `wire` only when the caller's onboarding is approved to fund (same flag the Fund step uses); commitment is still returned.
- Tests: investor cannot load readiness; no wire details before funding is approved.
