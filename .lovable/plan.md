# Commission payouts planned at SOW signing

## What you get
- When a statement of work is signed, the Commissions page immediately shows each future quarter's commission for every rep on that deal. The amounts come from the signed quarterly or annual payment schedule and the commission rates in effect at signing.
- Each future payout has one of three statuses:
  - **Expected:** the SOW is signed, but the client hasn't paid that period's invoice yet.
  - **Scheduled:** the invoice is paid, and the payout is queued for that quarter-end (today's existing behavior).
  - **Cancelled:** the invoice was voided, or the SOW was replaced. The reason is logged.
- The monthly, quarterly and annual totals on Commissions now cover both Expected and Scheduled amounts, shown separately. The reporting view (monthly, quarterly or annual) stays separate from the quarterly/annual pay schedule, as before.
- Payouts are still recorded by hand by Finance. Nothing pays an Expected amount.

## Technical details
- The pure helper `commission-forecast-model.ts` combines the signed SOW payment schedule (`buildPaymentSchedule`) with `ratesAt` and the existing stacking layers. The result is one expected row per period, per person, per layer, dated to the quarter-end after each due date. Vitest tests cover quarterly, annual, stacking, rate-at-signing and one-time exclusion.
- These expected rows are computed on read in `commissionReport` from signed quotes and their SOWs. No new payout rows are written, so the existing payout queue stays the only source of payable amounts.
- When an invoice is paid, `queueInvoicePayouts` writes the real Scheduled row, unchanged. The expected row for that period is hidden once a matching queue row exists.
- `onSowSigned` already runs at signing. Its rep notice gains the list of expected quarterly payouts.
- `CommissionTracker` and `PaymentPlanner` receive the Expected rows, marked with an "Expected" status. Payout recording stays limited to Scheduled rows.
