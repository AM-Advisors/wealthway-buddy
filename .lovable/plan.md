# Client signs the statement of work in their portal

Today an agreement is signed on paper and typed in by your team, then an administrator
approves it. The client never sees it. This adds the client-facing step: the agreement
appears in their portal, they read it, open the document, and sign it there — or send it
back with a reason. Your administrator approval then happens after the client has signed.

## What the client sees

In the client portal under **Agreement & scope**, each statement of work shows:

- Title, effective date, notice period, notes and the services it covers
- A clear status line: *Awaiting your signature*, *Signed by you — waiting on Harmonious approval*,
  *Approved and in force*, *Sent back for changes*, or *Draft — not ready yet*
- **View document** and **Download** when a document has been uploaded (secure, time-limited link)
- **Sign this agreement**: they type their full legal name and title and confirm. The typed
  name, the date and time, and their device details are recorded as their signature.
- **Send back with a question**: they write a reason; the agreement is marked as returned and
  the note goes to your team.

Only a contact on that client can sign, and only for an agreement that is ready for signature
(a draft is never signable). They can't change fees, dates or scope — only sign or send back.

## What your team sees

- The agreement editor and the Approvals board show the client's signature: who signed, their
  title, when, and the reason if they sent it back.
- The Approvals board groups a returned agreement under **Sent back by client** so it's clear
  it needs a revision, and won't offer Approve until the client has signed.
- Administrators can still approve or reject as they do now — approval simply requires the
  client's signature first.
- Staff can upload the agreement document (PDF or Word) on the statement of work so the client
  has something to read before signing.

## Order of events

```text
Draft -> Ready for signature -> Client signs -> Administrator approves -> In force
                                     |
                                     -> Sent back with a reason -> revised, re-issued
```

Fund creation and service activation already require an approved agreement, so nothing goes
live until both the client signature and the internal approval are recorded. Agreements already
signed and approved keep working — they are treated as already accepted so nothing in flight stops.

## Technical notes

Database migration on `public.client_sows`:
- `client_signature_name`, `client_signature_title`, `client_signed_at`, `client_signature_ip`,
  `client_signature_user_agent`, `client_signed_user_id`
- `client_status` text, default `pending`, check in (`pending`,`signed`,`sent_back`),
  plus `client_sent_back_reason` and `client_sent_back_at`
- Backfill: rows with `approval_status = 'approved'` set to `client_status = 'signed'` with
  `client_signed_at = COALESCE(approved_at, now())` so existing engagements aren't blocked
- Two `SECURITY DEFINER` RPCs, `EXECUTE` to `authenticated` only (client_sows updates are staff-only
  under current RLS): `client_sign_sow(_sow_id, _name, _title)` and `client_send_back_sow(_sow_id, _reason)`.
  Both verify the caller is in `client_users` for that agreement's client, that status is not `draft`,
  and that the agreement isn't already approved. Both write `contract_audit_events` with actor,
  timestamp and before/after values.

Server functions:
- `src/lib/client-portal.functions.ts` — extend the `client_sows` select with the new fields;
  add `signClientSow` / `sendBackClientSow` (via the RPCs) and `getSowDocumentUrl`, which checks
  the caller's `client_users` membership or staff role, then issues a short-lived signed URL through
  the admin client (imported inside the handler).
- `src/lib/contracts.functions.ts` — `decideSowApproval` requires `client_status = 'signed'` before
  `approved`; `listSowApprovals` returns the client signature fields and a `sent_back` grouping.
  Add `uploadSowDocument`-side path handling writing to `fund-formation/client-sows/<sowId>/<file>`
  (existing staff-only storage policy on that bucket prefix mirrors `service-amendments`, so a
  matching policy is added in the same migration).

UI:
- `src/routes/_authenticated/client.tsx` — replace the read-only agreement list with a new
  `src/components/client-sow-panel.tsx` carrying status, document links, sign dialog and send-back dialog.
- `src/components/sow-approvals-board.tsx` — show client signature/send-back state, add the
  **Sent back by client** group, disable Approve until signed.
- `src/components/sow-editor.tsx` — read-only client signature line plus a document upload control.
