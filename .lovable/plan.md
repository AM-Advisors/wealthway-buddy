# Fund website page: agreement, pricing and investor contact

Each fund already has a public web page at `/fund/<fund-name>` with the headline, summary,
raise progress, pitch deck, document list and an access-request form. This adds three things
to that page: the signed agreement status, what an investor pays, and a proper contact form
with a place for staff to work the enquiries.

## What visitors will see

**Administration and agreement**
A short panel confirming the fund is administered by Harmonious under a signed and approved
statement of work, with the effective date and the services in scope for that fund. No fees,
no document, no client commercial terms. When the fund has no signed and approved agreement,
the panel is hidden entirely rather than showing a gap.

The fund's own client, signed in to their portal, keeps the existing full view of the signed
agreement — nothing about that changes.

Wording stays MSA-aligned: Harmonious provides administration, onboarding, reporting,
payment facilitation and recordkeeping support. Nothing implies adviser, broker-dealer,
custodian, transfer agent or escrow roles.

**What it costs to invest**
A clear investor-cost panel: minimum investment, unit price, and any investor-paid fees
already recorded on the fund (outbound wire fee, closing cost), each labelled per investment
or one-time. Contracted administration rates between the fund's client and Harmonious are
never shown publicly. If no investor-paid fees are recorded, the panel shows minimum and
unit price only.

**Contact form**
A dedicated "Contact the fund team" form: name, email, firm, phone, and message, with the
existing spam trap and the same rate limiting the access form uses. This sits alongside the
access request, which keeps its own purpose (getting into the document room).

Submitting shows a confirmation and no investor data beyond what they typed is stored.

## What staff will see

A new **Enquiries** view listing contact-form submissions across funds: fund, name, email,
firm, message, received date and status (new, in progress, replied, closed), newest first,
with a filter by fund and by status. Staff can change status and add an internal note; each
change is written to the audit trail with who and when. Reachable from the admin sidebar and
from each fund's admin page.

## Technical notes

- New table `fund_enquiries` (offering_id, name, email, firm, phone, message, status,
  handled_by, handled_at, internal_note, ip, created_at) with RLS: insert via the
  service-role server function only, read/update restricted to staff. Explicit GRANTs to
  `authenticated` and `service_role`; no `anon` grant.
- `src/lib/public-fund.functions.ts`: extend `getPublicFundPage` to return
  `agreement` (signed + approved SOW only: effective date, notice period omitted, in-scope
  service names) and `investor_costs` (min investment, share price, `wire_fee_cents`,
  `closing_cost_cents` with their labels). Add `submitFundEnquiry` mirroring
  `requestFundAccess` validation, honeypot and throttling; Zod-validated with length caps.
- `src/lib/fund-enquiries.functions.ts`: staff-gated list and status-update functions,
  writing `contract_audit_events` (or the existing offering audit stream) on each change.
- `src/routes/fund.$slug.tsx`: three new sections plus anchor link in the page header.
- `src/components/fund-enquiries-board.tsx` and route `/admin/enquiries`, plus a link from
  `admin.fund.$fundId.tsx`.
- Fund page `head()` metadata stays as-is; no `og:image` is added since fund covers are
  bundled assets, not absolute URLs.
