# Payout calendar on Commissions

## What you get
- A new **Calendar** view on the Commissions page, next to the current tables. You can switch between Month and Quarter views and move forward or back in time.
- Each day on the calendar can show three kinds of markers:
  - **SOW signed:** the date each statement of work was signed, with the client and deal name.
  - **Payment period:** a bar covering each scheduled quarterly or annual billing period from the signed agreement, labeled with the service and amount.
  - **Payout:** the quarter-end payout date, with the total for that day. Colors show Expected (waiting on client payment), Scheduled, Paid out or Cancelled.
- Click any marker to see the details: client, service, period, person, role, commission amount and status. From there you can open that deal's full payout list.
- Filters for person, client and status. The calendar follows the page's existing access: reps see only their own deals, and leadership and Finance see everyone.
- It's view-only. Recording payouts still happens in the existing tracker, for Scheduled payouts only.

## Technical details
- No new data is stored. The calendar reads the existing `commissionReport` rows (expected and queue rows with `payoutDue`, period and status), plus the signed quotes' SOW signed dates (`client_signed_at`/`executed_at`), which get added to the report payload.
- A pure helper, `buildPayoutCalendar(rows, sows, range)`, in `src/lib/payout-calendar-model.ts` groups rows into day events and period spans. Vitest tests cover quarter/annual spans, same-day totals, status grouping and range clipping.
- A `PayoutCalendar` component builds a simple month/quarter grid with semantic tokens (not the date-picker). It is mounted as a tab on `sales_.commissions.tsx`, and its drill-down reuses the existing deal payout dialog.
