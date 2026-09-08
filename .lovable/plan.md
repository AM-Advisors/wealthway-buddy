# Audit trail for fund document and wire instruction changes

Record every admin change to a fund's documents and its wire/ACH instructions, so you can always see who changed what, and when.

## What gets recorded

Each time an admin saves in the Funds area, one entry is written:

- Fund details created or edited (name, summary, minimum, target raise, open/closed, Reg D type)
- Wire instruction fields added, changed, or cleared
- A fund document added, edited (title, type, signature requirement, order, body text), or removed

Each entry stores: the fund, what kind of change it was, which document it touched, the exact fields that changed with their before and after values, the admin's name/email, and the timestamp.

Sensitive wire values (account and routing numbers) are stored masked in the audit entry — the log shows that the field changed and the last four digits, not the full number.

Document body text is not stored in full in the log; it records that the text changed, along with its length before and after.

## What you'll see

On the Funds page, each fund gets a **Change history** section:

- Newest first, e.g. "Alyssa Pettit updated wire instructions — Bank name, Account number (••1234) — Sep 8, 2026 1:42 PM"
- Each row expands to show the individual field changes side by side (old → new)
- A filter for change type (fund details / wire instructions / documents)
- Shows the most recent 50 entries with a "Load more" control

## Rules

- Only admins can read the audit trail. Fund managers and investors cannot.
- Entries can never be edited or deleted by anyone through the app — the log is append-only.
- Existing fund editing, document downloads, packet PDF, and investor flows are unchanged; a failure to write an audit entry never blocks the save, but it is surfaced in the server logs.

## Technical notes

- New table `public.offering_audit_events`: `offering_id`, `offering_document_id` (nullable), `event_type` (`offering_created`, `offering_updated`, `wire_updated`, `document_created`, `document_updated`, `document_deleted`), `changes jsonb` (array of `{ field, from, to }`), `actor_id`, `actor_email`, `actor_name`, `summary text`, `created_at`.
- GRANTs: `SELECT, INSERT` to `authenticated`, `ALL` to `service_role`. RLS on. Insert policy limited to `private.has_role(auth.uid(),'admin')` with `actor_id = auth.uid()`; select policy admin-only. No update/delete policies.
- `src/lib/offering-audit.server.ts`: `diffRecords(before, after, maskFields)` and `recordOfferingAudit(supabase, event)`; masking for `account_number`, `routing_number`, `swift`, `iban`; body diffed by length only.
- `src/lib/offerings.functions.ts`: in `saveOffering`, `saveOfferingDocument`, `deleteOfferingDocument`, read the current row before writing, compute the diff after writing, and record the event. Actor identity from `profiles` by `context.userId`, falling back to the auth claims email.
- New admin-only `listOfferingAuditEvents({ offering_id, limit, before })` in `src/lib/offerings.functions.ts` (or a sibling `offering-audit.functions.ts`) returning paged entries.
- `src/routes/_authenticated/admin.funds.tsx`: collapsible Change history panel per fund using the existing card/badge components, loaded on expand via TanStack Query.
