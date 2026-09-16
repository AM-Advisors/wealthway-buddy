# Harmonious CapTable landing page + migration requests

A public product page for Harmonious CapTable, built around moving an existing
cap table off Carta or Pulley, plus a request-access form that lands on a staff
board where someone sends the portal invite.

## New public page: /cap-table

Sections, in order:

1. **Hero** — "Know exactly who owns your company." Sub-line: control how your
   private shares move; verify ownership; maintain the record. Two buttons:
   *Move from Carta* and *Move from Pulley*, plus a quieter *Start fresh*.
   All three open the same request form with the provider pre-selected.
2. **Migration strip** — "Your history comes with you." Three steps: export the
   file from your current provider, we detect the format and map the columns,
   you review every row before anything is recorded. Notes that Carta, Pulley,
   AngelList and plain spreadsheets are recognised, and that a concierge review
   is available.
3. **What it covers** — cap table and security types, employee equity and
   vesting, investor portal, fundraising rounds and SAFEs, secondaries with
   ROFR and consent, SPV and exposure verification, documents, compliance and
   audit history.
4. **Ownership record** — verify ownership, document exposure, maintain the
   record: the audit trail, certificates and ownership chain.
5. **Plans** — the five published cap table plans (Free, Starter, Growth,
   Scale, Enterprise) by name and positioning, with "talk to us" rather than
   a checkout.
6. **Closing CTA** — the same Carta / Pulley / fresh-start buttons.

Added to the top menu and the footer alongside Platform, Same-Day SPV and
Fund Administration.

## Home page

A CapTable section on harmonious.co's front page — headline, three-line
summary, the same Carta / Pulley buttons and a link through to /cap-table.
The existing hero and three pillars stay as they are.

## Request access form

Opens as a dialog from any CTA, pre-filled with the provider that was clicked.
Collects: full name, work email, company name, current provider (Carta, Pulley,
AngelList, spreadsheet, none), rough number of shareholders, and an optional
note. A checkbox confirms they have authority to act for the company.

On submit the founder sees a confirmation that the team will be in touch, and
nothing else is revealed. No account is created and the existing invite gate on
sign-up is untouched.

## Staff board: /admin/cap-table-requests

Every request with name, email, company, provider they are coming from,
shareholder count, note, when it arrived and who has it. Staff can mark a
request contacted, converted or declined, add an internal note, and jump
straight to the existing client invitation flow to send the portal invite.
Counts appear in the staff sidebar so new requests are visible.

## Technical detail

- New table `public.cap_table_leads`: name, email, company, source provider,
  shareholder count, note, status (`new` / `contacted` / `converted` /
  `declined`), assigned staff, internal note, timestamps, with `updated_at`
  trigger. GRANTs for `authenticated` and `service_role`; no `anon` grant.
  RLS: staff (`admin`, `super_admin`, `client_success`, `executive`) may read
  and update; nobody may insert through the Data API.
- Public submissions go through a TanStack server route at
  `/api/public/cap-table-request` (POST + OPTIONS), Zod-validated, with per-IP
  and per-email throttling (max 3 per email per day), inserting via
  `supabaseAdmin` after validation. It always returns the same generic success
  shape so the endpoint cannot be used to probe for existing customers.
- Staff reads/updates use `createServerFn` with `requireSupabaseAuth` in a new
  `src/lib/captable-leads.functions.ts`; every status change writes to the
  existing audit trail.
- Routes: `src/routes/cap-table.tsx` (public, SSR, own `head()` with title,
  description, og/twitter tags) and
  `src/routes/_authenticated/admin.cap-table-requests.tsx`.
- Landing page uses `SiteHeader` / `SiteFooter` and existing brand tokens —
  Rubik headings, Poppins body, navy and teal. No new colour values.
- Plan names are read from the published cap table pricing version so the page
  cannot drift from the catalogue.

## Out of scope

- No self-serve account creation; the invite gate stays.
- No provider API connection — file export/upload only, as already built.
- No public pricing figures.
