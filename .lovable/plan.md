# Show ROAS classes in the Fees & Terms summary card

## What you'll see
On the fund Setup tab, the Fees & Terms card currently shows blank fund-wide fields ("·"). For funds with multiple classes, it will instead list each class (A-1, A-2, A-3, B) as its own separated block:

- Class name and investment range (for example, $100K to under $200K)
- Management fee: 2% per year, paid quarterly, on capital account
- Carry: "None" for A classes; "Tiered profit sharing" for B, with a short summary
- Preferred return: 16%, 18%, 20%, or "None"

Blocks get clear spacing between them and stack neatly on phones.

A "Draft, awaiting approval" label appears above the classes until a second reviewer approves the terms. The status changes to "Approved" after that. The card won't say "Complete" while the terms are still a draft.

Fund-wide blank fields are hidden when classes exist. Single-class funds look the same as today.

## What stays the same
- Nothing gets approved or changed. This is only a display update.
- Edit still opens the existing fees and terms editor.

## Technical details
- `fund-setup-form.tsx`: when `hasMultipleClasses` is set, the fees summary section renders per-class cards from the latest economics version (approved first, otherwise the latest draft). Values come from the canonical economics read, and the layout uses `space-y-4` with responsive grids.
- The section's completion badge comes from the economics status: draft gets "Awaiting approval", approved gets "Complete".
- Add a small model helper in `fund-setup-form-model.ts` that formats each class row. It gets unit tests for the fee, carry, preferred return and range strings.
