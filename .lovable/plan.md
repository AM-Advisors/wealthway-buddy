# Offering Statement uses the fund's Fees record

## Goal
Management fee, carried interest and preferred return on the Offering Statement always come from the fund's active Fees (Fund Details → Team & Fees). They are never typed in twice and can never disagree.

## What changes for users
- In the Offering Statement editor, the three fields become read-only and show the fund's current active fees, with a "Change in Fees" link to the fund's Fees tab.
- If a fee change is waiting for approval, a small note says so; the statement keeps showing the active (approved) numbers until it's approved.
- If the fund has no fees set yet, the fields show "Not set" with the same link.
- The diligence room and investor view of the statement show the same live fund fees, so a published statement updates automatically when fees are approved.
- Everything else on the statement (headline, summary, terms text, dates) is unchanged and still edited on the statement.

## Technical details
- `src/lib/offering-statement.functions.ts`:
  - Add a helper that reads the active `fund_fee_terms` row (`management_fee_pct`, `carry_pct`, `hurdle_pct`) plus any `pending_approval` row, and converts percent to bps.
  - `getOfferingStatementForEdit` and `getOfferingStatement` overwrite `management_fee_bps`, `carried_interest_bps`, `preferred_return_bps` with those values (null when none) and return `feeSource: { active, pendingChange }`.
  - `saveOfferingStatement` strips the three fee fields from the payload and writes the canonical values into the stored columns, so old copies are corrected on every save and client input is ignored.
- `src/components/offering-statement-editor.tsx`: render the three fields disabled from server values, drop them from the save body, add the Fees link/pending note.
- `src/components/offering-statement-view.tsx`: no logic change (it already reads the returned values).
- One-time data fix: update existing `offering_statements` fee columns from each fund's active `fund_fee_terms` row.
- Fee changes keep going through the existing Fees flow (maker-checker after investors sign); this page never changes fees.
- Add an AGENTS.md rule: Offering Statement fee/carry/pref are projections of active `fund_fee_terms`, never independently edited.
