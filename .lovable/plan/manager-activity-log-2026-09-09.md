# Manager activity log

A single page showing what each admin and fund manager actually did: which investor applications they opened and reviewed, which documents they viewed or downloaded, and which wire confirmations they approved or sent back.

## What you'll see

A new **Activity** page in the Fund management area:

- A time-ordered feed: who, what they did, which investor and fund, and when.
- Filters: fund, person, activity type (applications, documents, wire decisions, fund edits, invitations), and time window (24 hours, 7 days, 30 days, all).
- Each row links straight to the investor's review page, the fund page, or the document.
- Admins see every fund; a fund manager sees only the funds assigned to them.
- A short summary strip at the top: reviews opened, documents opened, wires approved, wires sent back, in the selected window.

## Where the entries come from

Some reviewer actions are already recorded and will be shown immediately, including history from before this change:

- Wire confirmations approved or sent back (reviewer, timestamp, notes).
- Issue flags raised and resolved.
- Fund document and wire-instruction edits (existing fund change history).
- Due diligence document views and downloads.
- Invitations sent to managers and investors.

Two things are not recorded yet and need new tracking:

- Opening an investor's application for review.
- Opening or downloading an investor's signed or uploaded documents outside the diligence room.

## Technical approach

**Database (one migration)**

- New append-only table `public.reviewer_activity`: `id`, `actor_id`, `actor_email`, `offering_id`, `application_id` (nullable), `event_type`, `summary`, `metadata jsonb`, `created_at`. Indexes on `(offering_id, created_at desc)` and `(actor_id, created_at desc)`.
- GRANTs: `SELECT, INSERT` to `authenticated`, `ALL` to `service_role`.
- RLS: insert allowed when the actor is the signed-in user and can review that offering; select allowed for admins and for fund managers assigned to the offering. No update or delete policies (append-only).

**Recording (server functions)**

- `src/lib/manager.functions.ts`: log `application_opened` in `getFundInvestorReview` / the single-application review fetch, and `wire_decided` alongside `decideWireAsReviewer`; flags already write rows but also log for the unified feed.
- `src/lib/documents.functions.ts` and `src/lib/investor-uploads.functions.ts`: log `document_opened` / `document_downloaded` when a reviewer (not the owning investor) fetches a signed or uploaded file.
- Logging is best-effort: a failed insert never blocks the underlying action.

**Reading**

- New `src/lib/reviewer-activity.functions.ts` with `listReviewerActivity` (auth middleware, reviewer-scoped) that merges `reviewer_activity` rows with existing signals — `wire_confirmations` reviews, `application_flags`, `offering_audit_events`, `diligence_activity`, `fund_invitations` — into one normalised, paged, filterable list, plus `listActivityActors` for the person filter.

**UI**

- New route `src/routes/_authenticated/manager.activity.tsx` using the same fund-scoping as the other manager pages, with filters, summary counts, "Load more" paging, and a 30-second refresh.
- Sidebar entry "Activity" under Fund management, visible to admins and fund managers.

Existing pages, permissions, and data are unchanged.
