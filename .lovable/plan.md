# State Franchise Taxes and Annual Reports on each fund

## Goal
Each fund's Regulatory tab shows which yearly state filings apply (franchise tax, annual report, registered agent renewal), when they are due, what is needed to file, and sends reminders. Nothing is filed or paid automatically.

## What exists today
- Each fund has a hand-entered franchise fee list (state, description, due date, filed date) and a calendar.
- One generic "Entity annual report & franchise tax" reminder on June 1 for every fund, regardless of state.

## What we will build
1. **State rules table** (staff-maintained, sourced from official state sites, each with a source link and "last checked" date). Starting states: Delaware, Texas, Wyoming, Nevada, California, New York, Florida, Illinois. Per entity type (LLC, LP, Series LLC): filing name, due rule (e.g. Delaware LLC/LP June 1, Texas May 15, Wyoming first day of anniversary month), fee or "varies", late penalty, where to file, what to bring. Amounts are entered from the official sources; anything unconfirmed shows "Needs review" instead of a guess.
2. **Which states apply to a fund**, worked out from:
   - State of formation (required filing)
   - Fund manager / management company state and principal office (flagged "May require foreign registration, confirm with counsel", never assumed)
   Staff confirm or add states; Not applicable is allowed with a reason.
3. **Fund page: State filings card** on the Regulatory tab: each filing, next due date, status (Past due, Due within 30 days, Upcoming, Filed), who files (Harmonious, Client or counsel), fee, filing checklist (EIN, registered agent, principal address, managers), and a link to the state filing site. "Record as filed" saves date, confirmation number and receipt; a second person confirms, matching Form D.
4. **Due dates roll forward** each year after a filing is recorded; history kept and can't be edited or deleted.
5. **Reminders**: in-app to-do for the responsible person at 60, 30 and 7 days and when past due; email reminder to the fund manager when the client files (sent as Harmonious); Operations sees all funds in the existing Form D & Blue Sky list, renamed **State & federal filings**.
6. Replace the generic June 1 reminder with the state-specific dates; existing hand-entered fees are kept and shown.

## Out of scope
No automatic filing or payment, no legal advice wording; series under a master share the master's filing (shown once, linked).

## Technical notes
- New tables: state_filing_rules, fund_state_filings, fund_state_filing_events (append-only), with grants and RLS (staff + exact-fund managers read; staff write).
- Reuse fund-regulatory.functions.ts, fund calendar, fund-todo-model and the existing reminder email drain.
- Pure due-date model with tests (Delaware June 1, Texas May 15, anniversary-month rules, weekend handling, roll-forward).

## Questions to confirm
- Should client-filed reminders email the fund manager, or in-app only?
- Any states beyond the eight above to load first?
