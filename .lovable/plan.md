# Investor Fund Documents Page

A dedicated investor-facing page listing every document required for the fund they selected, showing at a glance what still needs signing and what is already complete.

This sits alongside the approved Due Diligence build; it is a smaller, self-contained page and can ship first.

## What the investor sees

Route: `/documents` (linked from the dashboard and the portal).

- Header with the fund name, the investor's application status, and a progress bar: "3 of 5 documents complete".
- Three groups, each collapsible:
  - **Action needed** — required documents awaiting the investor's signature, each with a Review & sign button that opens the existing signing flow.
  - **Completed** — signed documents with signer name, timestamp, and a Download link (short-lived secure link, matching how signed documents are handled today).
  - **For your records** — documents that must be read but do not require a signature (for example the PPM), with a View action and a read-acknowledged marker.
- Each row shows title, document type, whether a signature is required, current status badge (Not started / Awaiting signature / In progress at the signing provider / Completed), and the last activity date.
- Where signing has been sent through the external signing service, the row reflects the live provider status rather than claiming completion early.
- Empty state when the investor has not yet selected a fund, with a link into onboarding; loading skeletons and an error state.
- Fully responsive, using existing Harmonious cards, badges, tables and progress components.

## Behaviour

- Documents come from the fund's configured document set, so each investor only ever sees the documents for the fund on their own application.
- Status is derived from the investor's signature records, not hardcoded: no record = pending, provider in-flight = in progress, completed record = complete with its timestamp.
- Once every required document is complete, the page shows a "Documents complete — continue to funding" call to action pointing at the existing wire/ACH step.

## Technical notes

- Add `getInvestorDocuments` to `src/lib/portal.functions.ts` (authenticated server function): resolves the signed-in user's application and fund, joins offering documents with that application's signature records, and returns title, type, signature requirement, status, signer, signed timestamp and provider state. No other user's data is reachable — the query is scoped by the authenticated user id and existing access rules.
- Download links are generated server-side as short-lived signed URLs; storage paths are never sent to the browser.
- New route `src/routes/_authenticated/documents.tsx` with its own page metadata, using the existing query + suspense pattern and reusing the signing flow already used in the portal rather than duplicating it.
- No schema changes and no changes to existing signing, funding or admin behaviour.
