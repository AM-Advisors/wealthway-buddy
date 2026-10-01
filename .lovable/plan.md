# Phase 5: Ledger, QuickBooks, bank alerts and close sheets in Accounting

Our ledger stays the only set of books. QuickBooks and bank feeds produce suggestions and drafts. Every entry is still prepared by one person and approved by another, and corrections are reversals. Nothing moves money.

## What the team will see (Operations → Accounting & Reports)

New tabs next to the existing Reconciliation queue, Exceptions and Accounting mappings:

1. **General ledger**: pick a Fund and period to see the trial balance, account activity and journal entries. Each entry shows its source (manual, reconciliation, QuickBooks, capital call or distribution) and who prepared and approved it. Staff can draft entries; a different person approves them; corrections are recorded as reversals.
2. **QuickBooks**: each Fund can be linked to one QuickBooks company.
   - **Inbound**: QuickBooks activity is pulled in as draft entries using account mappings. Anything already pulled in, or created by us, is skipped. Drafts need the usual second-person approval.
   - **Outbound**: approved entries can be queued to send. Each batch needs staff approval before it's sent, and the result is recorded (sent, failed, or already in QuickBooks).
   - **Drift check**: compares QuickBooks balances to our ledger and flags differences. It never auto-corrects.
   - **File upload**: a QuickBooks export file goes through the same inbound path, for Funds without a live link.
3. **Bank alerts**: four alert types from the existing bank feeds.
   - Unmatched deposits waiting longer than a set number of days (default 3).
   - Bank balance differs from ledger cash.
   - Bank feed stale or needing reconnection.
   - Withdrawals with no matching approved payment.

   Alerts appear in the Accounting area's "Waiting now". Staff can acknowledge, assign or resolve them with a note; history is kept. Resolving an alert never changes a bank record.
4. **Close sheets**:
   - **Investor closing sheet**, per capital close: investors admitted, amounts committed, called and received (received means reconciled), signature status, an approval deadline, and second-person sign-off. The approved sheet is locked; changes start a new version.
   - **Month-end close checklist**, per Fund and month: bank reconciled, no open bank alerts, entries approved, trial balance ties, QuickBooks drift cleared or explained. Locking the period needs a second person.

Fund managers see their own Fund's approved close sheets and month-end status, read-only. They don't see ledger detail, bank alerts or QuickBooks.

## Safety boundaries
- No payments, transfers or bank instructions of any kind.
- Nothing posts to our ledger or to QuickBooks without a second person's approval.
- Every QuickBooks pull, send, alert decision and sign-off is kept as a permanent record.
- Testing uses clearly labeled test Funds only. No live QuickBooks company is touched until you link one.

## Needed from you
- QuickBooks connection: once the screens are built, I'll show a card to link a QuickBooks account. Until then, the file upload works.

## Technical section
- Reuse `ledger_books`, `journal_entries`/`journal_lines`/`journal_entry_events`, `accounting_periods`, `chart_of_accounts`, `bank_transactions`, `bank_reconciliations`, `close_checklist_items`, and `accounting_exceptions`. No second ledger.
- New append-only tables (service-role only, RLS on, mutation-blocking triggers):
  - `qbo_company_links`, `qbo_account_mappings` (versioned), `qbo_sync_runs`
  - `qbo_inbound_items` (unique per QuickBooks ID per Fund)
  - `qbo_outbound_batches` and `qbo_outbound_items` (approval, result)
  - `qbo_drift_snapshots`
  - `bank_alerts` and `bank_alert_events`
  - `close_sheets` and `close_sheet_versions` (kind: investor_closing or month_end), `close_sheet_decisions`
- Pure modules: `ledger-trial-balance.ts`, `qbo-sync-model.ts` (mapping, deduplication, drift), `bank-alerts.ts` (detection rules), `close-sheets.ts` (checklist and readiness).
- `.server.ts` and `.functions.ts` handle each area through the existing accounting staff permissions and fund-scoped manager checks. Inbound drafts are created via `draftJournalEntry`. Outbound sends only entries with status posted.
- Bank alerts are computed in the existing bank-feed processing and through a scheduled check. Investor-closing "received" uses `funding-status.ts`.
- QuickBooks calls go through the connector gateway after linking. If the link is missing, the screens degrade cleanly to file upload only.
- Add tests for every pure module and the separation-of-duties rules. Add rules to `src/lib/AGENTS.md`.
