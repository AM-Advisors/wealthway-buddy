# Quarterly and annual payment schedules for upgraded funds

## What you get
- When a fund is upgraded and its statement of work is signed, the platform builds a **payment schedule** for each recurring service on that agreement. Each service uses the quarterly or annual frequency written in the agreement, starting from its first billing date.
- The **Commissions** page gets a new "Scheduled payments" section. It lists each upcoming client payment (fund, client, service, amount, due date, status), plus the commission the rep expects from it.
- On each due date, two things go out automatically:
  1. **Client invoice:** the invoice is created and emailed to the client's billing contacts with the usual payment instructions.
  2. **Rep notice:** the assigned sales rep is emailed that the payment is due and what commission it will earn.
- When the client pays, the commission joins the existing quarter-end payout queue, the same as today. Payouts stay manual.
- Nothing moves money. A schedule can be paused or cancelled with a logged reason. Each send is recorded so the same invoice or notice never goes out twice.

## Rules
- The frequency comes only from the signed agreement. If a service has no quarterly or annual frequency, no schedule is made, and the item is flagged for staff to review.
- Agreements that are one-time-only create no schedule.
- An upgrade without a signed agreement shows "Waiting for signed SOW" and sends nothing.
- A changed or replaced agreement closes the remaining schedule rows and builds new ones; past sends stay in history.

## Technical details
- Table `payment_schedule_items` (offering, client, sow, service key, frequency, due date, amount cents, status scheduled/invoiced/paid/paused/cancelled, invoice id), plus append-only `payment_schedule_events`. RLS on, service-role grants. Writes go through server functions; reads reuse the commissions page's existing authorization.
- Pure helper `src/lib/payment-schedule-model.ts` turns SOW lines (`billing_frequency`, `first_bill_on`) into due dates, with Vitest tests for quarterly, annual, one-time skip and missing frequency.
- Schedules are built from the upgrade path (`service-level-upgrade.server.ts`) and from the signed-SOW handoff (`commission-notify.server.ts`), whichever happens last. Both are idempotent on (sow, service, due date).
- A daily job at `src/routes/api/public/hooks/payment-schedule.ts` uses the same pattern as `invoice-reminders.ts`. It creates due invoices through the existing invoice engine, then sends the existing `invoice-issued` email and a new `payment-due-rep` email. Idempotency keys are built from the schedule item id.
- Paid invoices flow into `queueInvoicePayouts` unchanged.
- The Commissions page gets a `ScheduledPayments` panel. It reads in-person totals from the existing payment-planning reads, so cadence stays consistent with the reporting views.
- AGENTS.md gets one rule: recurring payment schedules come only from signed-SOW frequencies and send invoices and notices, never money.
