# Signed quote to invoice to payment to commission payout

## How it works today
- An approved quote becomes a statement of work (SOW) that the client signs and Harmonious approves.
- Nothing creates invoices from a SOW. The 4 invoices on file were added another way, and there are no signed quotes yet.
- Clients already have an Invoices page where they can approve or dispute an invoice and tell us they've paid.
- The commission tracker reads paid invoices. Today Finance enters each payout by hand.

## What gets built

### 1. Billing schedule on every SOW
- Each service line on the SOW gets a billing frequency: one-time, monthly, quarterly or annual. It also gets a first billing date, which defaults to the SOW's effective date.
- The frequency comes from the quote, and Sales can change it before the quote is sent. Once the client signs, it's locked.

### 2. Invoices drafted on each due date
- Once Harmonious approves a signed SOW, its billing schedule starts.
- On each due date, a draft invoice is created for the lines due, with the period covered and payment terms.
- Each date can only make one invoice, so running it twice never bills twice.
- Finance reviews the draft, and a different person clicks Issue. A Super Admin may issue their own draft after giving a reason, which is kept permanently.
- Issuing emails the client and puts the invoice on their Invoices page, and on portal home when it's due.
- Corrections are made by voiding the invoice with a reason and issuing a new one. Issued invoices are never edited.

### 3. Clients pay by card, bank transfer or wire
- **Card:** a Pay by card button opens secure online checkout. When the payment provider confirms, the invoice is marked paid automatically, with the provider's reference.
- **Wire or ACH:** the client sends the money themselves. It's matched from the bank feed as today, or Finance records it.
- Harmonious never pulls money from a client's account. Refunds stay manual and outside the platform.

### 4. Commission payouts scheduled automatically
- When an invoice is paid, each rep's commission is queued as **Scheduled** for the quarter-end date. The rates and stacking rules stay the same.
- Finance, the CRO or the CEO confirms each scheduled payout with the payroll date and reference. That turns it into **Paid out**.
- No money is sent by the platform.
- If an invoice is voided, or a card payment fails or is reversed, its scheduled payouts are cancelled with the reason shown.
- Paid-out records stay permanent; Reverse keeps working as today.

## Before card payments work
Card checkout needs online payments switched on. I'll turn on the built-in payments service, which starts in test mode. Taking real card payments then requires you to complete the provider's live-mode setup. Until then, the Pay by card button only works with test cards.

## What won't change
- Client and Operations screens stay separate, and every check stays on the server.
- Pricing and commission rates are unchanged.
- No automatic refunds, money pulls or payouts.

## Technical details
- **Migration:**
  - `sales_quote_lines` and the SOW generated lines get a billing frequency and first billing date.
  - New table `invoice_schedules` (sow_id, line, frequency, next_due_on, active) with a uniqueness rule on (sow_id, period_start) for invoices.
  - New table `commission_payout_queue` (invoice_line_id, user_id, layer, amount, due_on, status scheduled|confirmed|cancelled, reason), with an append-only events table.
  - Confirming a queued payout writes the existing immutable `commission_payouts` row.
  - Grants and RLS limited to staff, with payout queue reads following the current commission visibility.
- **Daily job:** a server route `/api/public/hooks/invoice-schedule`, run once a day with a server-only secret. It only drafts invoices, never issues or charges.
- **Issuing:** `issueInvoice` with a maker-checker check through `ops-capabilities`, using the money-path setting.
- **Payments:**
  - Card checkout uses the built-in payments service.
  - The existing `/api/public/payments/webhook` checks the provider signature, then marks the invoice paid.
  - Marking an invoice paid, whether by webhook, bank match or Finance, queues payouts through one shared `onInvoicePaid` helper.
- **Tests:**
  - one invoice per period
  - a draft can't be issued by its own maker
  - a quarterly schedule produces the right dates
  - a paid invoice queues payouts at quarter-end
  - a void cancels queued payouts
  - only Finance, the CRO or the CEO can confirm a payout
- **Records:** the rules are added to AGENTS.md, and the Help Center articles for clients (paying an invoice) and staff (issuing and confirming payouts) are updated.
