# Accounting pages for entering Roas Hedge LP's real books

Roas Hedge LP has no statements, transactions or invoices on file yet. This plan turns the fund's Accounting tab into one place where Harmonious staff enter the real records. Everything entered is a record only: nothing is paid, collected or moved, and every posting still needs a second person to approve it (Super Admins may approve their own with a logged reason).

## What staff will see (Fund → Accounting)

A sub-menu at the top of the tab with five sections:

1. **Bank statements**
   - **Upload a statement PDF**: lines are read from the file and shown for review. Staff fix categories, match deposits to investors, skip lines, then click "Apply to books". The existing tie-out check still blocks a statement whose lines don't add up to its opening and closing balances.
   - **Enter a statement by hand** (new): bank account, period, opening and closing balances, then type each line (date, description, in/out, amount, reference). The same tie-out check applies, and the statement is saved as a draft until it's applied.
   - A list of every statement, showing its period, balances, status and who applied it.

2. **Bank transactions**
   - One list of every bank line for the fund, from uploaded or typed statements, with filters: unmatched, matched to an investor, matched to an invoice or bill.
   - **Add a single transaction** (new) for a one-off line that isn't on a statement yet.
   - Match a line to an investor's capital, a fund bill, or a Harmonious invoice. Corrections are reversals, never edits.

3. **Fund bills** (bills the fund owes: legal, audit, admin and so on)
   - **New bill**: vendor, invoice number and date, service period, category, amount, a copy of the bill, and a status of either **Needs to be paid** or **Paid on [date]**.
   - "Paid" can be linked to the bank transaction that paid it.
   - These use the fund's existing expense and payable records, so a second person approves each one before it posts to the books.
   - **Record payment** on an unpaid bill, with the payment date and an optional link to a bank line.

4. **Harmonious fees**
   - Harmonious's invoices to Roas, using the existing invoice tool limited to this fund, including the new "already paid in the past" option.
   - Payments received are recorded with their date and reference.

5. **Summary**
   - Cash per the statements versus cash per the books, unmatched lines, unpaid bills and open Harmonious invoices.
   - Display only: the figures are read from the records and can't be changed here.

Who can use it: Harmonious staff with accounting or finance roles can enter records. Roas's fund managers can view their fund's bills and statements but can't post anything.

## Rules kept

- No money movement, payment initiation or filings.
- Maker-checker on every posting.
- Applied statements and posted entries are permanent; mistakes are corrected with reversals.
- Fund totals and investor counts stay hidden from investors.

## Technical details

- Reuse existing books code: the statement functions in fund-books (upload, list, update line, apply, save draft), the expense and settlement functions in fund-accounting (prepare and post expense, prepare and post settlement), the invoices board (filtered by fund), and the existing reconciliation readers for the summary.
- New server functions, all requiring sign-in and checked on the server against staff roles:
  - Create a hand-entered statement, plus add, edit or remove its lines while it's a draft (stored in the existing statement-upload rows and statement lines, marked as manually entered).
  - Add a single manual bank transaction (stored in the existing bank transactions table with a unique duplicate-check key).
  - Upload a bill copy to the existing private fund files storage with access logging.
- Small database addition: a "manually entered" marker and an "entered by" person on statement uploads, plus a pointer from a bill to its stored copy. All additions are optional fields, so nothing existing breaks.
- The Accounting tab is reorganized into the five sections, with the existing Ledger and AccountTab content kept under the Summary section.
- Tests: tie-out math for hand-entered statements, the duplicate-check key for manual transactions, "paid" bills needing a paid date that isn't in the future, and a block on entering and approving your own posting (except Super Admin with a reason).
