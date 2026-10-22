# Signed SOW payouts with next payout date on Commissions

Most of this is already in place: signing a statement of work creates Expected payouts for each future quarter, and they become Scheduled once that invoice is paid. Per your earlier choice, payouts are never payable before the client pays. This plan fills in what's still missing.

## What you get
- **Next payout column:** the Commissions page shows each deal's and each person's next payout date and amount. A Scheduled payout comes first; if none exists yet, the next Expected one is shown, labeled "Expected — awaiting client payment".
- **Next payout summary:** a new box at the top of the page shows the next quarter-end payout date and the total Scheduled for it, plus the total Expected.
- **Per-deal schedule:** clicking a deal opens its full list of payouts (date, person, role, amount, status), drawn from the signed SOW's quarterly or annual schedule.
- **Signing email:** when the SOW is signed, the rep's email now lists the expected payout dates and amounts, noting that each one is confirmed once the client pays.
- **Payment updates:** when an invoice is paid, that period's row switches from Expected to Scheduled with its quarter-end date. If an invoice is voided, the row shows Cancelled with the reason.

## Rules (unchanged)
- Commission is calculated on gross profit at the rates in effect at signing.
- Only Scheduled payouts can be recorded as paid, and Finance still records them by hand. Nothing moves money.

## Technical details
- `commissionReport` already returns expected and queue rows. Add a pure helper, `nextPayout(rows)`, in `commission-model.ts`: it picks the earliest Scheduled row per person and per deal, falling back to the earliest Expected row. Vitest tests cover scheduled-over-expected precedence, cancelled exclusion, and ties.
- In the UI, a "Next payout" column goes in By person and in the deal list, a summary Stat, and a deal drill-down dialog that reuses the `CommissionTracker` rows filtered by quote.
- `commission-notify.server.ts` (the SOW branch) computes the expected rows for that SOW with the same projection helper, and passes `expected: [{ dueOn, amount }]` to the `commission-scheduled` template, which renders the list. The idempotency key is unchanged.
