# A single page per fund for fund managers

The manager area today is a set of cross-fund lists: investors, document inbox, wires, diligence rooms and so on. What is missing is one page per fund that answers "where is this fund up to?" — setup progress, its documents, and its investor applications, all in one place.

## What gets added

**A fund home at `/manager/fund/<fund>`**, reachable from a fund card on the manager panel and from the fund switcher. Managers only see funds they are assigned to; admins see any fund.

### 1. Setup progress

A checklist with a percentage complete, each line either done (with the date) or showing what is missing and a link straight to the page that fixes it:

- Fund basics — name, Reg D type, minimum, target raise, share price
- Legal entity — legal name, entity type, state and date formed
- Tax ID — EIN entered or Form SS-4 generated (shows "with operations" until approved)
- Bank account — wire instructions saved, or a bank setup request and where it stands
- Fund documents — at least one document investors must sign
- Offering memo and offering terms — drafted and published
- Diligence room — created, with the core sections filled
- Timeline — key dates entered
- Investors — at least one invited

### 2. Documents

Everything the fund holds, grouped and each with its current version and last update:

- Documents investors sign, with how many investors have signed each
- Diligence room materials by section
- Signed copies filed back, with timestamps
- Tax documents operations has approved for this fund
- Links to add or edit, which open the existing document pages with this fund preselected

### 3. Investor applications

Every applicant in this fund in one table: name and account type, commitment, stage (identity, screening, accreditation, documents, subscription, funding), whether a manager has approved them, wire status, and money received. Search, stage filter, per-stage counts, and a row link to that investor's existing review page. Totals for committed, in transit and received sit above the table with the target raise.

The page refreshes itself as investors sign and wires land, the same way the existing fund activity does.

### 4. Fund cards on the manager panel

The manager panel gets a card per assigned fund at the top — name, Reg D type, setup percentage, investor count and committed total — each linking to the fund home. The long tool list stays where it is.

## Technical notes

- New `src/lib/manager-fund.functions.ts` with `getManagerFundHome` under `requireSupabaseAuth`: authorises through the existing admin/`fund_managers` check used in `manager.functions.ts`, then reads offering fields, `get_wire_instructions`/`offering_bank_setup_requests`, `get_offering_entity_details` (respecting the operations review gate), `offering_documents` + `offering_document_versions`, `diligence_rooms`/`diligence_documents`, `offering_memos`, `offering_statements`, `offering_timeline_events`, `fund_tax_documents` (approved only), `investor_applications` with profiles/personas, `document_signatures`, `wire_confirmations` and `payments`. Returns one plain DTO with `progress`, `documents`, `applications` and `totals`; no new tables or migration.
- Progress is computed server-side as a list of `{ key, label, done, detail, href }` so the UI stays presentational.
- New route `src/routes/_authenticated/manager.fund.$fundId.tsx` (route id `/_authenticated/manager/fund/$fundId`) with its own `head()`, `errorComponent` and `notFoundComponent`.
- New `src/components/manager-fund-home.tsx` holding the progress checklist, documents and applications sections; reuses `SignedDocumentsCard` and the status helpers in `src/lib/status.ts`, and subscribes to the same realtime tables as `fund-operations.tsx`.
- `manager.index.tsx` gains the fund-card grid, fed by the existing `getManagerPanelSummary` plus a small progress figure from the new function.
- Verification: typecheck and build, then load the fund home for an assigned fund as a manager and confirm the checklist, document counts and application rows match the fund's real data.
