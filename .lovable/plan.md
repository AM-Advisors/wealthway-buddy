# Staff sign-off page

One place where your team approves or rejects everything a client is waiting on, and the client's dashboard immediately shows the outcome and your note.

## What you get

A new **Sign-off** page for staff with four queues:

1. **Extra service requests** — work a client asked for outside their current scope.
2. **Wire requests** — money movement a client raised from their portal.
3. **Agreement approvals** — signed statements of work waiting on a Harmonious decision.
4. **Invoice queries** — invoices a client has questioned.

Each row shows the client, the fund, what was asked for, the amount where there is one, who raised it and when. Two buttons: **Approve** and **Reject**, each with a note box. The note is required on a rejection and optional on an approval, and the client sees it either way.

A counter at the top of each queue shows how many items are waiting, oldest first, with anything over five days old flagged as running late.

## What approve and reject do

- **Service request** — approving switches the service on for that client straight away and records who approved it. If the agreement still needs a client signature or a fee first, the page says exactly what is missing and links to the fee step instead of half-approving it. Rejecting closes the request with your reason.
- **Wire request** — approving marks it approved for the money-movement desk (the existing two-person payment approval still applies before funds move). Rejecting closes it with your reason.
- **Agreement** — approving marks the statement of work approved; rejecting sends it back with your reason. The existing rule stays: nothing is approved until the client has signed it.
- **Invoice query** — approving the query pulls the invoice back so it can be corrected; rejecting the query keeps the invoice as it stands and re-asks the client to approve it. Your note goes with it.

Every decision is written to the audit trail with who decided, when, and the before and after state.

## What the client sees

On their portal dashboard, a **Decisions from Harmonious** panel lists each recently decided item with its outcome (Approved or Not approved), the date, and your note. Their existing request, invoice and wire cards pick up the same status wording, so nothing shows as "waiting on Harmonious" once you have decided it.

## Who can use it

Staff with contract authority (legal, finance, compliance, client success, CEO, CRO, admin) can decide. Other staff see the queues read-only. Clients never see this page.

## Technical notes

- New route `src/routes/_authenticated/admin.signoff.tsx` plus `src/components/signoff-board.tsx`, added to staff navigation.
- New `src/lib/signoff.functions.ts` with `listSignoffQueue` (staff-gated, one parallel read per queue) and `decideSignoffItem` (`kind`, `id`, `decision`, `note`). It delegates to the existing guarded paths rather than writing state itself: `activateServiceRequest` / `declineServiceRequest`, `decideWireRequest`, `decideSowApproval`, and new invoice-query handling in `invoices.functions.ts`.
- Migration: add `dispute_resolution`, `dispute_resolution_note`, `dispute_resolved_at`, `dispute_resolved_by` to `invoices` so an invoice query has a recorded outcome; no new tables.
- Client-visible notes reuse existing columns: `service_requests.review_note`, `wire_requests.review_note`, `client_sows.approval_note`, and the new invoice fields.
- Client side: extend `src/lib/client-portal.functions.ts` to return decided items and add the decisions panel to `src/components/client-dashboard.tsx`.
- Audit entries go through the existing contract-audit and reviewer-activity helpers.
