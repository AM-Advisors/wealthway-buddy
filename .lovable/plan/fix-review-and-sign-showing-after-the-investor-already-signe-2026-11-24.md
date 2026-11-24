# Fix "Review and sign" showing after the investor already signed

## Where the gap is
The investor's Sign step only has two wordings while it is open:
- "Waiting for signing to finish" (when the step is in progress)
- "Review and sign your documents" (anything else)

The step is marked finished only when every signature on the paper is complete, including the fund's countersignature. So after Todd signs, until Thomas countersigns, the step can fall back to "Review and sign your documents" even though Todd has nothing left to do. The checklist behind it already knows "Investor signed, waiting on fund countersignature"; the investor's step label just doesn't use it.

## What I'll change
1. Confirm on Todd's record which state the Sign step gets today (first step, before any change).
2. When the investor has signed and only the fund countersignature is left, show the Sign step as done for the investor with the line: "You signed. Waiting on the fund's countersignature." No button asking them to sign.
3. Use the same rule on the fund manager and Operations views of the investor, so they show "Waiting on fund countersignature" and point to the countersigner.
4. Nothing about signatures, approvals or admission changes: countersigning is still required and still counts as the approval.

## Checks
- Add a small test: investor signed + countersign pending gives the new wording, never "Review and sign".
- Re-check Todd's step label after the change.

## Technical notes
- `src/lib/investor-journey-model.ts` (sign step state/message) reads the readiness `signature` requirement; use the existing countersign-pending reason from `investment-readiness.ts` / `readiness-reasons.ts` rather than a new check.
- Test next to existing journey model tests.
