# Fund manager: see and complete fund setup

## What fund managers will see
- **Fund Overview (top of page):** while setup is not finished, a "Finish your fund setup" checklist card sits first, with progress (e.g. "2 of 4 complete") and the four steps: Fund details, Fees & team, Bank / wire instructions, Documents. When everything is approved, it shrinks to a one-line "Setup complete" note.
- **Each step shows what's already on file:** what Harmonious has already entered for the fund (legal name, entity type, state, address, minimum, target raise, fees, signer, documents already uploaded) now shows as "On file". So a fund like Long Live Monarch won't look empty.
- **Complete or correct:** "Complete this step" / "Suggest a change" opens the form with the on-file values already filled in. The manager fills in what's missing and submits it, and Harmonious reviews it as it does today. A short "Missing: …" line lists the blanks.
- **Clear status per step:** Not started, Missing info, Waiting for Harmonious review, Needs changes (with Harmonious's note), Approved.
- **Setup & Settings tab:** keeps the same checklist, so both places match.
- **Sidebar/tab badge:** "Setup" shows how many steps still need the manager.

## What does not change
- Submissions still go to Harmonious for review. Nothing a manager enters changes the fund record until staff approve it.
- Bank details stay "last 4 digits + bank letter" only. Full account numbers are never typed.
- Only managers of that fund can see or submit. Every submission is checked on the server, and the existing Slack alert to Operations still fires.

## Technical details
- New server function `fundSetupOnFileFn(offeringId)`, authorized as staff or a `fund_managers` member of that offering. It returns an allow-listed snapshot from `offerings` (legal_entity_name, name, entity_type, state_formed, date_formed, principal_address, min/target), the active `fund_fee_terms` row, the signatory/team display names, and document kinds already uploaded. No tax IDs or bank numbers.
- `FundManagerSetupLoader`: merge the on-file snapshot with the latest submission per section. Use it to fill the form, compute "Missing" and set status. Add a `compact` prop for the Overview placement.
- `manager.fund.$fundId.index.tsx`: render the loader first when it isn't complete.
- `fund-workspace-layout.tsx`: add a count badge on "Setup & Settings".
- Verify with a fund-manager-scoped browser check on a synthetic fund only.
