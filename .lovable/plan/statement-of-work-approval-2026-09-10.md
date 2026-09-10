# Statement of work approval

Signed agreements currently jump straight into use: the record stores who signed and when, but
nobody inside Harmonious records that the signature was reviewed and accepted. This adds that step
and a board to watch it.

## What changes

**On the agreement record**

Three new fields: an approval state (pending, approved, rejected), who decided and when, and a note
for the reason. A newly created or edited agreement starts as pending. Saving a signature does not
approve it.

**Who decides**

Only administrators can approve or reject. Everyone else with agreement access sees the state and
the reviewer's name, and can open the agreement, but the approve and reject buttons are absent.

**The board**

A new "Approvals" tab in Pricing and agreements, grouped into three lists:

- Awaiting approval — signed agreements with no decision yet, oldest first, with the days waiting
- Approved — with reviewer, date and any note
- Rejected — with the reason, so it is clear what has to change

Each row shows the client, agreement title, type, fund it belongs to, effective date, signer and
signature date, with a link into the editor. Approving asks for an optional note; rejecting requires
a reason. Every decision is written to the contract audit trail with the before and after state.

**What approval unblocks**

- Creating a fund from an agreement now requires the agreement to be signed **and** approved.
  The setup screen only lists approved agreements; the reason unavailable ones are missing is
  spelled out on screen.
- Activating a service under an agreement is refused until it is approved, with a plain message
  naming the agreement waiting for sign-off.

Existing agreements that are already signed and active are treated as approved at migration time,
so live funds and services keep working. Anything signed but not yet active becomes pending.

## Technical notes

- Migration on `public.client_sows`: `approval_status` text, default `pending`, constrained to
  `pending | approved | rejected`; `approved_by` uuid, `approved_at` timestamptz, `approval_note`
  text. Backfill `approved` where `status = 'active' AND signed_on IS NOT NULL`. Index on
  `approval_status`.
- `src/lib/contracts.functions.ts`: `saveSow` never sets approval fields; new `listSowApprovals`
  (staff read) and `decideSowApproval` (`requireAdmin`, validates the agreement is signed, writes the
  decision plus a `contract_audit_events` row).
- Gating: `src/lib/fund-sow.functions.ts` signed-SOW selector and fund-create check add
  `approval_status = 'approved'`; `activateServiceRequest` and entitlement activation in
  `contracts.functions.ts` reject when the linked agreement is not approved.
- New `src/components/sow-approvals-board.tsx`, mounted as an `approvals` tab in
  `src/routes/_authenticated/admin.pricing.tsx`. `sow-editor.tsx` gains a read-only approval badge.
