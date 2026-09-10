# Termination and offboarding

A single place to run a client's wind-down from the day notice arrives to the day records
are closed out — with the statement of work named, the 60-day clock calculated, the final
amounts settled against the client's agreed rates, the data export delivered, and the
records Harmonious must keep listed with their retention reason.

## The workflow

```text
Notice received  ->  Winding down  ->  Final settlement  ->  Data delivered  ->  Closed
```

**1. Termination notice.** Staff open a case for a client: who gave notice (client or
Harmonious), the date notice was received, and a note. The case records who logged it.

**2. Statement of work identified.** The case is tied to one of the client's statements of
work (or the whole engagement). The page shows that agreement's title, type, effective
date and its own notice period.

**3. 60-day period.** The end date is calculated from the notice date plus the notice
period on the selected agreement, defaulting to 60 days. Staff can override the end date
with a reason. The page shows days remaining, and a clear banner once the period has
passed.

**4. Outstanding amounts.** The case lists the client's agreed rates as a settlement
checklist — each line shows the service, pricing basis and amount from the client's
recorded rates. Staff mark each line settled, waived or disputed, with an amount and a
note. A summary shows what is still open. Nothing is invoiced or charged here; this is a
record of what the team confirmed.

**5. Data export.** Two things, both on the case:
- A download that produces spreadsheets of the client's funds, investors and applications,
  funding and payment records, document list and the contract audit trail for that client.
- A delivery record: what was sent, how, to whom and on what date, plus who confirmed it.

**6. Retained records.** The case lists what Harmonious continues to hold after the
engagement ends — each record with its category, classification, the date it can be
released, and whether it is on legal hold with the reason. Staff add and edit these lines.
Wording states plainly that records may be kept for legal, regulatory, audit or claims
reasons, and that this is a record of retention, not legal advice.

**7. Close.** A case can only be closed when every settlement line is settled, waived or
noted as disputed with a reason, the export delivery is recorded, and at least the
retention list has been reviewed. Closing stamps who closed it and when.

## What the client sees

A read-only "Winding down" panel in the client portal: the agreement being terminated, the
notice date, the end date and days remaining, the current stage, a plain summary of what is
still outstanding, their retained-records list, and a button to download their own export.
Internal notes and disputed-amount commentary stay staff-only.

## Rules

- Only legal, compliance, finance, client success, CEO, CRO or admin authority can open,
  change or close a case. Any Harmonious staff member can view.
- Every stage change, settlement decision, date override, export delivery and retention
  edit is written to the contract audit trail with who, when and the before/after, and
  appears under Scope and fees in the audit log.
- A client can view only their own case and cannot change anything.
- Language avoids implying Harmonious makes legal, tax or regulatory determinations.

## Where it lives

- New "Termination" tab on Pricing and agreements, listing all open cases with client, end
  date, days remaining and what's blocking closure.
- A case detail page per client at `/admin/offboarding/$caseId`.
- The client's read-only panel on the existing portal page.

## Technical notes

- Uses existing `offboarding_cases` (client, statement of work, notice date, notice days,
  end date, status, `steps` jsonb, note) and `record_retention` (label, classification,
  category, retain-until, legal hold, reason). Settlement lines, date-override reason and
  export delivery details are stored in the case's `steps` jsonb — no schema change unless
  the settlement list needs its own rows, in which case one migration adds
  `offboarding_settlement_items` with grants, RLS mirroring the case policies and a client
  read policy.
- One migration is needed regardless: a client-visible SELECT policy on `record_retention`
  scoped to the client's own rows (today it is staff-only), plus `initiated_by`,
  `closed_by`/`closed_at` columns on `offboarding_cases`.
- New `src/lib/offboarding.functions.ts`: `listOffboardingCases`, `getOffboardingCase`,
  `openCase`, `updateCase`, `saveSettlementLine`, `recordExportDelivery`,
  `saveRetentionRecord`, `closeCase`, `exportClientData` — all `requireSupabaseAuth`, staff
  or contract-authority gated, auditing to `contract_audit_events`. Client-facing reads go
  through a separate `getMyOffboarding`.
- Settlement lines seed from `client_pricing` for that client.
- Export is built server-side as CSV text per dataset and zipped in the browser from the
  returned strings, matching the download pattern already used by the audit log.
- New components `offboarding-board.tsx`, `offboarding-case.tsx`, `retention-list.tsx`;
  new routes `admin.offboarding.$caseId.tsx`; tab added to `admin.pricing.tsx`; sidebar
  entry added.
