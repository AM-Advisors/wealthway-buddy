# Operations portal for banking, SS-4s and tax documents

A separate area of the app for your operations team, where every fund's banking request, generated SS-4 and tax paperwork is checked and approved. Fund managers only see these items once operations has approved them.

## Who gets in

- A new **Operations** role, invited the same way managers are invited.
- Admins also have access, so you can always see and act on the queue.
- Operations sees all funds, not just assigned ones. Investors and managers never see the operations area.

## What operations reviews

Three queues, each with pending / approved / rejected states, a reviewer name, a timestamp and an optional note back to the requester:

1. **Banking requests** — every "have Harmonious open the account" request (Mercury, Texas Capital Bank, Customers Bank). Operations approves, moves it to in progress, marks it opened, or rejects with a reason.
2. **SS-4 / EIN** — the generated Form SS-4 and the EIN entered for a fund. Operations opens the PDF, checks it, then approves or sends it back. Once approved and an EIN is confirmed, the fund is marked EIN-verified.
3. **Tax documents** — W-9, W-8 (BEN / BEN-E) and K-1s, uploaded per fund and optionally tied to a specific investor. Operations reviews each file and approves or rejects it.

## Pages

- `/ops` — home: counts of everything waiting, oldest items first, quick links.
- `/ops/banking` — the banking request queue with fund, bank, requester, note and status actions.
- `/ops/ss4` — funds with an SS-4 or EIN awaiting review, with a private link to open the PDF.
- `/ops/tax-documents` — upload, review and approve tax documents; filter by fund, type and status.
- `/ops/funds/$fundId` — everything for one fund in one place.

## What managers see

On the fund page, the entity and banking card only shows items operations has approved. Anything pending shows as "with operations for review" with no document link; rejected items show the reason to admins and to whoever raised them. Tax documents appear to managers only once approved.

## Emails

- Operations is notified when a new banking request, SS-4 or tax document arrives.
- The requesting manager is notified when an item is approved or rejected, with the note.

## Technical notes

- Migration: add `operations` to the `app_role` enum and a `private.is_operations()` helper (mirroring `private.has_role`); add `public.can_review_operations()` returning true for admins and operations.
- `public.offering_bank_setup_requests`: add `review_status`, `reviewed_by`, `reviewed_at`, `review_note`; RLS gains an operations/admin write policy, and the manager-visible read path filters to approved.
- `private.offering_entity_details`: add `ein_review_status`, `ss4_review_status`, `reviewed_by`, `reviewed_at`, `review_note`; extend `get_offering_entity_details` to return them, plus new security-definer RPCs `review_offering_entity` and a `list_pending_entity_reviews` for the ops queue.
- New `public.fund_tax_documents` (offering_id, optional investor_user_id, `doc_type` check in w9/w8ben/w8bene/k1/other, `tax_year`, `storage_path`, `file_name`, `review_status`, reviewer fields, timestamps) with GRANTs to authenticated + service_role, RLS: operations/admins full access; assigned managers read approved rows only; updated_at trigger. Files go in the existing private `fund-formation` bucket under `tax/<offering_id>/`, served through signed URLs from server functions.
- New `src/lib/operations.functions.ts`: `getOpsQueue`, `reviewBankRequest`, `reviewEntityDetails`, `listTaxDocuments`, `uploadTaxDocument`, `reviewTaxDocument`, `getTaxDocumentUrl` — all under `requireSupabaseAuth` with an operations/admin check inside each handler.
- Routes under `src/routes/_authenticated/ops.*.tsx`, plus an Operations section in `app-sidebar.tsx` gated on the role, and role handling in `post-signin.ts` so operations staff land on `/ops`.
- `src/components/fund-entity-card.tsx` and `src/lib/fund-entity.functions.ts` updated to hide unapproved items from managers and show review state.
- Invitations: allow `operations` as an invite role in `invitations.functions.ts` and the invite UI; `sync_roles_and_invitations` grants the role on sign-up.
- Emails: two new templates (`ops-review-request`, `ops-review-decision`) registered in the email registry and sent through the existing alert helper.
- Verification: typecheck and build, then load each `/ops` page and run one banking request and one tax document through approve and reject.
