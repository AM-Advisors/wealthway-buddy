# Client portal: invoices, approval status and wire requests

Today a client contact signing into the portal sees their funds, agreement, invoices and
only those payments Harmonious has already approved. Wire requests are invisible to them
entirely, and there is no way for a client to raise one. This closes those gaps.

## What clients will be able to do

**Invoices (already there, extended)**
- Every issued invoice with amount, due date, overdue flag and lines.
- A clear approval line: awaiting your approval / approved by you on a date / queried.
- Approve or query an invoice, exactly as today.

**Payments**
- Every payment tied to their engagement, not just approved ones: awaiting checks,
  awaiting approval, one approval recorded, approved, sent, settled, on hold, cancelled.
- Who at Harmonious approved each step and when, plus the reference once sent.
- Wording stays accurate: Harmonious facilitates and records payments; it does not hold
  client money as a bank, custodian or escrow agent.

**Wire requests (new)**
- A list of every wire request on their funds with amount, purpose, expected date,
  status and the reviewer's decision note.
- A "Request a wire" form: fund, amount, purpose, expected date and a note.
  It is only a request. It goes into the same Harmonious review queue and still needs
  the usual checks and two separate approvals before any money moves. The form makes
  that explicit.
- The form only offers funds inside the client's active scope. If wire facilitation is
  not in their scope the portal shows exactly:
  "This service is not currently included in your active scope. Request service."

## Technical notes

**Database (one migration)**
- `payment_instructions`: replace the client read policy that filters to
  approved/sent/settled/completed/released with one that lets a client contact read
  every row for their own `client_id`. Bank/beneficiary account detail stays masked in
  the server function rather than sent raw.
- `wire_requests`: add a SELECT policy for client contacts on funds whose
  `offerings.client_id` is visible to them (`private.client_visible`).
- Add a guarded `SECURITY DEFINER` RPC `client_create_wire_request(...)` that inserts a
  `pending` request only when the caller is a client contact on that fund's client, the
  fund's scope includes wire facilitation, and no blocking compliance hold exists. It
  writes a `contract_audit_events` row. Execute granted to `authenticated` only, revoked
  from `anon`.

**Server functions** — `src/lib/client-portal.functions.ts`
- Extend the portal loader: return all payment instructions (no status filter) with a
  normalised stage, approval records from `payment_approvals` joined to approver names
  and times, and the client's wire requests joined to fund name and reviewer name.
- Add `createClientWireRequest` calling the new RPC.

**UI**
- `src/components/client-payments-panel.tsx` (new): payment rows grouped by stage, with
  an approval timeline (name + timestamp per approval).
- `src/components/client-wire-requests-panel.tsx` (new): request list plus the request
  form dialog with the scope gate.
- `src/routes/_authenticated/client.tsx`: Payments tab renders the new payments panel;
  add a "Wire requests" tab. Header counters change to open invoices, payments in
  progress and open wire requests.

**Unchanged**
- Approval authority: only Harmonious staff approve invoices for collection, clear holds
  and record the two payment approvals. Nothing in the portal moves money.
