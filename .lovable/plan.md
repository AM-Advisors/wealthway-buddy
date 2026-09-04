# Fund manager portal, live verification test, and document round-trip

Three pieces: a dedicated workspace for fund managers, a real Didit status event proving live sync, and an end-to-end check of the fund PDFs from admin download through investor signature.

## 1. Fund manager portal

Today, fund managers sign in and land on the same compliance console admins use. The queue and detail pages already limit them to their assigned funds, but there is no home of their own and no way to see a fund at a glance.

New area at `/manager`:

- **Fund switcher** — a manager assigned to more than one fund picks which one they are looking at; a manager with one fund goes straight in.
- **Fund overview** — investors in the fund, total committed, and counts by stage (waiting on identity, waiting on accreditation, documents outstanding, funding pending, complete).
- **Investor roster** — one row per investor showing name, email, investor type, commitment, and four status chips: identity, accreditation, documents, funding. Filter by stage and search by name or email.
- **Investor detail** — one page per investor with profile, identity and screening results, accreditation evidence and attestation, every fund document with signature status and a download of the signed copy, funding method and payment state, and the verification event history. Reviewers can approve or decline accreditation and documents here, and leave internal notes, exactly as admins do today.
- Managers get a **Manager** link in the top bar instead of **Admin**; admins keep both and can view any fund.

Everything a manager sees stays limited to the funds they were granted on the Access page — enforced in the database, not just the interface.

## 2. Complete the Didit check and prove live sync

The test investor account currently has an open Didit session sitting at Pending. To prove the portal really moves on its own:

- Add an admin-only **Send test verification event** control on the application review page. It builds a properly signed `status.updated` event server-side using the stored Didit signing secret and posts it to the live webhook — the same path Didit uses, no shortcuts around signature checking.
- Run it against the test investor: send Approved, watch the portal card and the compliance checklist flip to Approved without a refresh, then confirm the record in the database matches.
- Repeat once with Declined on a throwaway record so both outcomes are proven, then leave the test investor Approved.

Note: actually finishing the ID scan inside Didit's hosted flow needs a person with a document and camera, so the genuine end of that session is yours to complete whenever you like. The signed-event test proves the exact same code path Didit's own callback runs.

## 3. Document download and signing round-trip

- Sign in as admin, download all six PDFs (both the 506(b) and 506(c) funds' memorandum, partnership agreement and subscription agreement) and inspect each rendered page.
- Sign in as the test investor, sign the subscription agreement, then download the countersigned copy from the portal.
- Compare the investor's signed copy against the admin original: same document text, plus the signature block, signer name, timestamp and document fingerprint. Report any mismatch and fix it.

## Technical notes

- New routes: `src/routes/_authenticated/manager.index.tsx` (fund switcher + overview + roster) and `src/routes/_authenticated/manager.$applicationId.tsx`. The detail body is extracted from `admin.$applicationId.tsx` into a shared component so both consoles stay identical in behaviour.
- New `src/lib/manager.functions.ts`: `getManagerFunds` (assigned offerings, or all for admins) and `getFundOverview` (roster plus stage counts) — both `requireSupabaseAuth`, relying on the existing `fund_managers` policies for row scoping; no service-role reads.
- Test event: a `requireSupabaseAuth` server function that verifies the caller is an admin, reads `DIDIT_WEBHOOK_SECRET` inside the handler, computes the same HMAC headers `src/lib/didit.server.ts` validates, and posts to `/api/public/webhooks/didit`. Marked as a test event in the payload so it is auditable in `didit_webhook_events`.
- No schema changes needed; `fund_managers`, `investor_applications` and related policies already cover this.
