# Request Additional Service: end-to-end workflow

Today a client can press "Request service" and the request lands in the database, but there is no
place for Harmonious to work it, no fee proposal the client sees, no signature, and activation is a
single staff action with no client agreement behind it. This completes the loop.

## The five stages

```text
1. Requested   client asks for a service that isn't in their scope
2. In review   Harmonious confirms it can be done and what it depends on
3. Quoted      Harmonious proposes the fee, pricing basis and start date
4. Signed      the client accepts in writing (typed signature, recorded)
5. Active      the service is switched on and appears in their scope
```

A request can also be declined or withdrawn at any point before it is active, with the reason kept.

## What the client sees

- A "Requests" area in the client portal listing every service they have asked for, its stage, the
  proposed fee, and what is waiting on whom.
- When a fee is proposed: the amendment terms on screen (service, fee, basis, start date, notes,
  the statement of work it attaches to), an acknowledgement that this amends their agreement, a
  typed-name signature box and an Accept button. Declining and withdrawing are available too.
- After signing, the request shows "Signed — waiting on Harmonious to switch it on", then "Active"
  with the date, and the service stops showing the not-in-scope message wherever it is used.
- The existing "Request service" card gains the same stage messaging instead of one flat line.

## What Harmonious sees

A "Service requests" queue inside Clients and scope (`/admin/contracts`) plus per-client view:

- Filter by stage, client and fund; newest first, with the ask, requester and date.
- Move to In review with a note.
- Propose a fee: amount, pricing basis (fixed, annual, per investor, per filing, pass-through),
  start date, which statement of work it amends, optional uploaded amendment PDF, and terms text.
  Standard rate-card amounts are suggested from the published rate card so quotes stay consistent.
- Decline with a reason.
- Once the client has signed: an Activate button that turns the request into a real entitlement,
  writes the agreed rate onto the client's rates, and stamps who activated it and when.
  Activation stays blocked until a signature exists and a statement of work is attached.

Every stage change is written to the contract audit trail with who, when and the before/after.

## Rules built in

- Only legal, compliance, finance, client success, executive or admin authority can review, quote,
  decline or activate. Any staff member can view the queue.
- Clients can only sign their own request, only while it is quoted, and only the acceptance fields —
  they cannot change the fee or activate anything.
- No activation without a recorded client signature and an attached statement of work.
- The exact wording "This service is not currently included in your active scope. Request service."
  is preserved for any service outside active scope.

## Technical notes

Database migration:
- Add to `service_requests`: `signer_name`, `signer_title`, `signed_ip`, `amendment_terms`,
  `activated_at`, `activated_by`, `declined_reason`, `withdrawn_at`. Existing columns
  (`status`, `proposed_fee_cents`, `proposed_pricing_model`, `amendment_path`, `client_approved_by`,
  `client_approved_at`, `activated_entitlement_id`, `effective_date`) are reused.
- Status values: `requested`, `in_review`, `quoted`, `declined`, `signed`, `activated`, `withdrawn`.
- `accept_service_quote(_request_id, _signer_name, _signer_title)` — security definer, sets the
  acceptance fields only when the caller passes `private.client_visible` and status is `quoted`;
  granted to `authenticated`. Clients get no direct UPDATE policy on the table.
- `withdraw_service_request(_request_id)` — same guard, allowed before activation.
- Reuse the private `fund-formation` bucket under `service-amendments/<client>/<request>.pdf` for
  uploaded amendment PDFs, with a staff-only storage policy; signed URLs for client download.

`src/lib/contracts.functions.ts`:
- `listServiceRequests` extended with fund name, requester name, SOW options and rate-card
  suggestion per service key.
- `getMyServiceRequests` — client-scoped read for the portal.
- Split `reviewServiceRequest` into `startServiceReview`, `quoteServiceRequest`,
  `declineServiceRequest`, `activateServiceRequest`; each audits. `activateServiceRequest` keeps the
  existing upsert into `service_entitlements` and additionally writes a `client_pricing` row for the
  agreed amount.
- `acceptServiceQuote` / `withdrawServiceRequest` call the two RPCs.

UI:
- `src/components/service-requests-board.tsx` — staff queue with stage actions (reused on the
  contracts index and the per-client page).
- `src/components/service-request-signing.tsx` — client-side terms, signature and accept/decline.
- `src/routes/_authenticated/portal.tsx` — add the Requests section.
- `src/components/service-gate.tsx` — stage-aware messaging on the request card.
