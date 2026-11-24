# Client perspective: see what's missing and fill it in from the same view

## Today
"View client perspective" is read-only. It lists each requirement and its status but doesn't show which details are missing, and nobody can enter anything there. People have to leave and find the right form on the investor page.

## What changes

### 1. Each open item shows exactly what's missing
Clicking an item (About you, Verification, Sign, Fund) opens a panel that:
- lists each missing detail by name: legal name, address, birthday, phone, SSN/EIN, owners/signers, ownership %, responsible party, W-9 signer, commitment amount, ID card, and so on
- says who it's waiting on: the investor, a helper, the fund manager or Harmonious
- shows the items already done with who completed them and when (as today)

### 2. Fill it in right there
Each missing detail gets an input with a "Save" button, using the same saves as the investor page, so nothing is stored twice.

| Who | Can enter |
|---|---|
| Harmonious | All details, and can correct existing values |
| Fund manager (this fund) | Blank details, owners/signers, ID card upload, commitment before signing |
| Fund team member with "manage investors" permission | Same as fund manager |
| Helper assigned to this investment | Blank personal and entity details, owners/signers, ID card. No amounts or notes |
| View-only fund team | Sees the missing list only, no inputs |

After each save:
- a "Done and saved" confirmation appears
- the item updates
- the checklist refreshes

### 3. What stays with the investor (shown, but not editable)
- financial background answers, certifications and review/certify
- signatures and ID check consent

These show "Waiting on the investor" with a "Send reminder" button that uses the existing reminder.

### 4. Same view everywhere
- The panel works from the fund roster, the investor page and the helper's own page.
- The "Completed by" switcher keeps showing the helper's and investor's views. Saves made from the panel are recorded as "By {name}" in the history.

## Default I'm using
View-only fund team members can see what's missing but can't type in it; only team members allowed to manage investors can. Tell me if view-only team should be able to enter details too.

## Technical details
- Extend `investor-perspective.server.ts` to return per-item `missing` fields, sourced from readiness and `entity-investor-requirements.ts`, plus `canEdit` flags. These are computed from `fundAccessFor`, `investorDeskActor` (with `viaTeam` permission) and the active preparer assignment.
- Add a `PerspectiveFieldForm` in `investor-perspective.tsx` that calls existing `updateInvestorRecordFn`, `editRelatedPartyFn`, the tax-ID card save and the ID-card upload. The preparer path passes `preparerId`. No new write engine.
- Investor-only keys (`bsa_aml`, `subscription_questionnaire`, `certifications`, signatures) never get inputs, and the server rejects them as before.
- Invalidate the perspective, investor-record and readiness queries after each save. Add a completion event for history attribution.
- Tests: view-only team gets no edit flags, a helper can't set amounts, a manager of another fund is refused, and investor-only items never get inputs.
- Update the QA sandbox fixture so the click-through can be checked with fictional data.
