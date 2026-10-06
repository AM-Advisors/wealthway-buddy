# Two-party sign-off for MSAs and SOWs

## Goal
An MSA or SOW becomes active only after both sides have signed. The client signs first, then Harmonious countersigns.

## Flow

```text
Draft (Sales) -> Sent to client -> Client signed -> Harmonious countersigned -> Active
```

- **Client signs first.** The client's authorized signer types their name, title and signature on the MSA or SOW. The agreement then shows "Client signed, awaiting Harmonious".
- **Harmonious countersigns.** The CEO, a Super Admin or Legal countersigns. Sales prepares and sends agreements but can't sign for Harmonious. A countersigner can't countersign an agreement they drafted.
- **Active.** After both signatures, the agreement is locked. It gets a signed copy with both signatures, dates and the exact version. Later changes go through amendments.
- **Countersigning is blocked until the client has signed.** Each signature is kept permanently with who signed and when.

## What changes
- **MSAs.** Today an MSA is marked signed as soon as the client signs. It will now wait for Harmonious to countersign, using the same countersign box SOWs already have on the Sales agreements page.
- **SOWs.** These already ask the client first and then Harmonious. I'll tighten this:
  - Countersigning is refused if the client hasn't signed.
  - The drafter can't countersign their own agreement.
  - Status labels become clear: "Awaiting client signature", "Awaiting Harmonious countersignature", "Active".
- **Follow-up lists.** The Sales agreements page, the read-only agreements page for Operations and Account Managers, and the client's Agreements page all show who still needs to sign.
- **Notifications.** When the client signs, the CEO, Super Admins, Legal and the client's Sales owner get an in-app task to countersign. When it becomes active, the client sees "Active" on their Agreements page.
- **Nothing is blocked.** An agreement awaiting countersignature is still a follow-up item only. It never blocks fund or investor work, which is the existing rule.

## Existing agreements
- The 5 SOWs already marked active stay active. They're labeled "Active before two-party signing" so the history is honest.
- No MSAs have been signed yet, so none need changes.

## Technical details
- `agreements.functions.ts` `signMsa`: after the client signature, set status `client_signed` with `client_approved_at`. Don't set `executed_at` or create `agreement_executions` yet.
- New `countersignMsa` in `agreements-admin.functions.ts`, gated by `requireSign` (CEO, Super Admin, Legal). It requires an existing client signature row and rejects a signer who is `created_by`. It inserts the `agreement_signatures` row with side `harmonious`, then sets `executed_at`, status `executed`, and the execution snapshot.
- `countersignSow` / `executeAmendment`: add a client-signature-exists check and the drafter is not countersigner check.
- Countersign tasks go through `staff_tasks` (`createTask`). Tasks are deduped per agreement.
- Data step: label the 5 existing active SOWs as legacy (audit event plus a `legacy_activation` flag column, default false). No status rewrite.
- UI: add the countersign box for MSAs on the Sales agreements page. Show the stage labels in `admin.agreements.tsx`, `ops.agreements.tsx`, and the client agreements pages.
- Record in `src/lib/AGENTS.md`: agreements are active only after the client signature and then a Harmonious countersignature.
