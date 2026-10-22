# Invite investor by email, name and optional commitment

## What changes
- The fund's **Add / invite investors** window (fund workspace Investors tab) currently only shows the shareable onboarding link. Add an **Invite by email** form at the top with:
  - Email (required)
  - Name (optional)
  - Commitment amount, USD (optional, labeled "optional")
  - **Send invitation** button
- The shareable link stays below it as "Or share the fund's link".
- The manager-side **Invite Investor** panel already has these fields; relabel its amount field "Commitment amount (optional)" so both read the same.
- After sending, the investor list refreshes and shows the new invited person with their commitment amount.

## Rules kept
- Uses the existing invitation sending and permission checks — no new access, closed-fund block still applies.
- Commitment is only an intended amount; the investor still completes About You → Verification → Sign → Fund and confirms their own amount.
- Blank or invalid amounts are rejected on screen (must be a positive number).

## Technical details
- Reuse `ManagerAddInvestor` (src/components/manager-add-investor.tsx) inside the dialog in src/components/fund-tabs/investors-tab.tsx, adding an `onSent` callback to refetch the tab query and a compact mode without its own card header.
- Amount parsing stays `inviteInvestorFn` `intendedAmountCents`; add a small test for the amount parser (e.g. "250,000" → 25,000,000 cents, "abc" rejected, blank → null).
