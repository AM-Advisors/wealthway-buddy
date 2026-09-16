# Connect the documents: fund files, a personal vault, and investor checks under each fund

Three problems today: an investor's uploaded paperwork is one long list with no fund
attached, "Documents" and "Fund documents" overlap and both repeat the same upload box,
and a fund's team can see investor check badges only on a separate Investors screen.

## 1. Files sit under the fund they belong to

- When someone uploads paperwork, they pick the fund it relates to (pre-selected when
  they only have one). Uploads already record a fund internally; this makes it visible
  and correct rather than always assuming the current application.
- "Fund documents" becomes the one place per fund: the fund's legal documents, what still
  needs signing, and that fund's own uploads — nothing from other funds.
- "Documents" keeps the signing progress and hand-off to funding, and drops its duplicate
  upload box; it links to the fund page and to the vault instead.

## 2. A vault of everything, per person

New page: **Vault** (`/vault`), in the sidebar for investors and for client contacts.

- Investors see, grouped by fund and then "Not fund specific": signed documents, fund
  documents issued to them, their own uploads, capital account statements, and
  accreditation/identity evidence they supplied.
- Client contacts see their agreements and statements of work, policy sign-offs,
  invoices and payment confirmations.
- Each row shows what it is, which fund, the date, who signed it, and a download. Filter
  by fund, by kind, and search by name. Links expire after a few minutes as they do now.
- Read-only: uploading and signing stay on the pages that own those steps.

## 3. Investor checks under the fund

New **Investors › Compliance** view on the fund page itself (both the manager fund page
and the admin fund page), so the fund's team never has to leave the fund:

- One row per investor: identity (KYC), sanctions/AML, and accreditation, each with
  status, the date it was decided, method (self-certified, third-party letter, or
  verified provider), and expiry where one applies.
- Fund managers can open the supporting evidence files for investors in their own fund —
  ID, accreditation letters, bank letters — through short-lived links, and every open is
  written to the existing document view log.
- Filter by outstanding, expiring soon, and complete. 506(c) funds show a clear marker
  where verification evidence is required rather than self-certification.
- Roll-up counts at the top so a manager sees at a glance who is holding the fund up.

## Navigation tidy-up

- Investor sidebar: Dashboard · My fund (fund documents) · Signing · Vault · Funding.
- Manager sidebar: the fund page becomes the hub; "Fund documents" and "Investors" link
  into its tabs rather than standing alone.

## Technical notes

- `investor_documents` already carries `offering_id` and `application_id`; add a fund
  selector to `recordMyUpload` input and a `fundId` filter to `listMyUploads`.
- New `src/lib/vault.functions.ts`: one authenticated fetcher that merges
  `document_signatures`, `offering_documents`, `investor_documents`,
  `capital_account_statements`, `client_sows`, `policy_acceptances` and `invoices` into a
  typed row list, each with a signed-URL action; RLS scopes it to the caller.
- New `src/lib/fund-compliance.functions.ts`: per-fund join over `investor_applications`,
  `kyc_verifications`, `aml_screenings`, `accreditation_records` and
  `accreditation_documents`, gated by admin or `fund_managers` membership for that fund,
  reusing the `reviewerScope` pattern in `fund-page.functions.ts`.
- Evidence opens reuse `logLegalDocumentView` for the audit trail; no new buckets.
- Routes added: `src/routes/_authenticated/vault.tsx`; compliance panel component mounted
  in `manager.fund.$fundId.tsx` and `admin.fund.$fundId.tsx`. Each new route gets its own
  head metadata.
- No schema change expected beyond RLS review for manager reads of accreditation evidence.
