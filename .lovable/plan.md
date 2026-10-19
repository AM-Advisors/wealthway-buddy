# Commission Tracker (Sales)

Sales already has a Commissions page that works out each rep's share once a signed quote's invoice is paid. This turns it into a full tracker: one row per deal and rep, with the client, what was sold, what the client paid, and when the commission was or will be paid out.

## What you will see (Sales → Commissions → new "Tracker" view)

Each row shows:
- Client and quote
- Services sold (each service on the quote, with its sold price)
- Amount the client has paid for each service, and the date paid
- Rep and their role on the deal (AE, BDR, Sales Manager, CRO, CEO)
- Rate and commission amount
- Payout status and date:
  - **Not earned yet**: client hasn't paid. Shows "Expected payout: end of quarter after the client pays."
  - **Scheduled**: client paid. Payout date is the last day of the quarter the client paid in (e.g. paid Feb 10 → payout Mar 31).
  - **Paid out**: recorded paid, with the actual date and payroll reference.

Filters: period, rep, client, status. Totals at the top: earned, scheduled, paid out, not yet earned. Download as a spreadsheet file.

## Recording a payout

- Finance, CRO or CEO can select scheduled rows and "Mark paid out" with the payout date and a payroll reference (optional note).
- This only records it; the platform never sends money.
- Paid-out records can't be edited or deleted. A mistake is fixed by a reversal entry with a reason, kept on the history.

## Who sees what (unchanged)

Reps see their own, sales managers see their team, CRO, CEO and Finance see everyone. Checked on the server.

## Technical details

- New table `commission_payouts` (quote, invoice line, user, layer, amount_cents, payout_date, reference, note, recorded_by, reversal_of, reason), GRANT + RLS, immutability trigger like other `block_*_mutation` triggers; unique active payout per invoice line + user + layer.
- `commissionReport` in `commissions.server.ts` extended: add sold amount from quote lines, client paid amount/date from invoice lines, scheduled payout date = quarter end of `paid_on`, joined payout records; add rep/client/status filters.
- New `recordCommissionPayout` / `reverseCommissionPayout` in `sales-hub.functions.ts`, allowed only for finance, cro, executive roles (server-side).
- Pure helper `payoutDueDate(paidOn)` in `commission-model.ts` with unit tests (Feb 10 → Mar 31, Dec 31 → Dec 31, Apr 1 → Jun 30).
- UI added to existing `sales_.commissions.tsx`; mobile-friendly card layout under small screens.
- Save memory: quarter-end payout rule and Finance/CRO/CEO record payouts.
