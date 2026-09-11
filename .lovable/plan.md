# Never miss an invoice due date

Every invoice already emails the client's administrators the moment it is issued, with the
amount, the line items, the due date and a link to pay. This plan makes sure that email is
never silently missed, and adds reminders around the due date.

## 1. Reminders before and after the due date

A daily check looks at every issued, unpaid invoice and sends a branded reminder at these
points:

- 7 days before the due date
- 3 days before the due date
- on the due date
- the day after it becomes overdue, then once a week until it is paid or voided

Each reminder shows the invoice number, amount outstanding, due date, how many days are left
or how far past due it is, and a button into the client's invoice page. Paid, draft, voided and
disputed invoices are skipped. Each stage is sent once per invoice per person, so a repeated
run never double-emails.

Reminders go to the same people who receive the invoice: the client's decision-making contacts
(GP, signatory, finance, legal, compliance and anyone with approval rights). Read-only contacts
are not emailed.

## 2. Make sure nothing is missed

On the staff invoice screens, each issued invoice gains a delivery line showing whether its
email actually went out, to whom, and if it was rejected, bounced or blocked because that
person previously unsubscribed. Staff get a **Resend invoice email** button for anything that
did not land, which sends the same branded invoice email again.

An "Email not confirmed" marker on the unpaid invoices board makes it obvious at a glance when
an issued invoice has no successful send behind it.

## Notes

- Draft invoices stay silent, as they do now. They have no number, amount or due date yet.
- Reminders never change an invoice's status. Marking an invoice paid stays a staff action
  after the money is matched.
- Sending is never allowed to break invoicing: if an email fails, the invoice is unaffected and
  the failure shows on the staff screen.

## Technical detail

- New template `src/lib/email-templates/invoice-reminder.tsx`, registered in
  `src/lib/email-templates/registry.ts`.
- New scheduled route `src/routes/api/public/hooks/invoice-reminders.ts`, which selects issued
  unpaid invoices, computes the reminder stage from `due_date` against today, and sends via the
  existing `notifyClientAdminsWith` helper with idempotency key
  `invoice-reminder:{invoiceId}:{stage}` — no new table and no email queue.
- A `pg_cron` job calls that route once a day at 13:00 UTC. One run per day, so no meaningful
  recurring cost; worst case a reminder lands up to 24 hours after the stage boundary.
- Delivery state read server-side with `listEmailLogs` from `@lovable.dev/email-js`, exposed
  through a staff-gated server function and surfaced in `src/components/invoices-board.tsx` and
  `src/components/unpaid-invoices-board.tsx`.
- Resend reuses the existing `invoice-issued` template through a staff-gated server function in
  `src/lib/invoices.functions.ts`, with a fresh idempotency key and an audit entry.
- No changes to invoice creation, issuing rules, rate checks or payment matching.
