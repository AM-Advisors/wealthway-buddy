# Accreditation as its own step on the Review & Sign page

## Result
On the investment's Review & Sign page, accreditation becomes its own clearly labeled step, placed right after the investor questionnaire and before the tax form and documents.

- **Already accredited:** if the investor's profile has a current, verified accreditation (from this or an earlier investment), the step shows "Accreditation verified" with the date and method, and asks nothing.
- **Not yet done:** the step is prefilled from the investor's answer to the last questionnaire question (which accredited-investor category applies). The investor confirms it with one click. For funds that require third-party verification, they upload proof or request a verification letter instead.
- The questionnaire's accreditation answer and the accreditation step stay in sync, so the investor never answers it twice.
- Once confirmed or verified, the accreditation status updates. If identity is approved and documents are signed, funding then opens (the funding rule from the last change).

## Unchanged
- Who may approve accreditation evidence, existing review screens, and audit history.
- A self-certification never counts as verification on funds that require verified accreditation.
- No money movement or automatic approvals.

## Technical details
- Reuse the existing accreditation actions (self-certification, verification request, evidence) and reusable profile accreditation; no new engine.
- Map the questionnaire's accredited-investor category answer to the self-certification basis; submitting the questionnaire prefills the step; the server records it only after the investor confirms.
- Gate the tax form and subscription documents behind questionnaire completion only (accreditation runs alongside, not as a blocker to signing), and keep funding gated on accreditation as today.
- Add focused tests: reused accreditation skips the step; the questionnaire answer maps to the right basis; self-certification is refused where verification is required.
- Check Alyssa's CORPS Erebor investment reads as "needs accreditation" before the change and shows the new step afterward.
